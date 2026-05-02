# Forge On-Demand Pods — Volume-Bootstrap Plan

**Status**: Planning
**Date**: 2026-04-30
**Replaces**: the GHCR-image-pull approach in [gpu-server/Dockerfile.serverless](gpu-server/Dockerfile.serverless)

---

## 1. Problem

Skyie Forge needs on-demand RunPod GPU pods that:
- Boot in <60s (after first cold start)
- Run a FastAPI server (`serve.py`) that wraps FLUX-dev / PuLID / LoRA inference
- Self-register with the Skyie backend so users see a green "Connected" pill
- Auto-terminate after idle

The current code (committed on `main`) tries to do this with a custom Docker image at `ghcr.io/sgadminuk/skyie-studio-forge:latest`. **It does not work.**

## 2. Why the current approach fails

The image pull from `ghcr.io` into RunPod's EUR-IS-1 datacenter **stalls at ~44%** on two specific layers and never completes. Verified empirically across 4+ deploy attempts. Same volume + same GPU + datacenter + a 5 MB alpine image pulls in <60s, so the bug is specifically: large image + ghcr.io + EUR-IS-1.

We spent a full session trying to work around it (registry auth, image visibility, GPU SKUs, dockerArgs, RunPod regions). None of it addressed the root cause: **we shouldn't be shipping a 3-4 GB custom image at all**.

## 3. The new architecture

Skip the custom image entirely. Use RunPod's own pre-cached PyTorch base image and store our code + dependencies on the persistent network volume that's already attached to every Forge pod.

This is the same pattern the legacy "always-on" pod uses ([gpu-server/startup.sh](gpu-server/startup.sh)). We were re-inventing it.

```
┌────────────────────────────────────────────────────────────┐
│ Network Volume /runpod-volume  (existing, EUR-IS-1, 500GB) │
│                                                              │
│   models/.hf_cache/...        ← FLUX weights cache          │
│                                                              │
│   forge-app/                  ← NEW: our app lives here     │
│     ├ serve.py                ← FastAPI shim                │
│     ├ handler.py              ← FLUX inference logic        │
│     ├ requirements.txt        ← pip dep list                │
│     ├ startup.sh              ← pod boot entrypoint         │
│     └ venv/                   ← pip-installed deps (~3 GB)  │
└────────────────────────────────────────────────────────────┘
                       ▲
                       │ mounted at /runpod-volume on every pod boot
                       │
┌──────────────────────┴─────────────────────────────────────┐
│ Pod uses RunPod's official base image                       │
│   imageName: runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel- │
│              ubuntu22.04                                     │
│                                                              │
│   Pulls in seconds (mirrored on RunPod's own infrastructure)│
│                                                              │
│   dockerStartCmd: ["bash","/runpod-volume/forge-app/startup.sh"]│
└──────────────────────────────────────────────────────────────┘
```

`startup.sh` (lives on the volume):

```bash
#!/bin/bash
set -e
cd /runpod-volume/forge-app

# First-ever boot on this volume: create venv and install pip deps.
# Takes ~3 min. Subsequent pods skip this entirely (~5s reuse).
if [ ! -d venv ]; then
    python3 -m venv venv
    venv/bin/pip install --no-cache-dir -r requirements.txt
fi

# Fall through to FastAPI shim. handler.py side-effect imports diffusers/
# transformers and loads FLUX from /runpod-volume/models/.hf_cache/...
exec venv/bin/python -u serve.py
```

## 4. Why this is strictly better

| Concern | Old (custom image) | New (volume bootstrap) |
|---|---|---|
| Image pull time | 3-4 GB stalls forever | ~50 MB base, pulls in seconds |
| Image rebuild cycle | GHA build (~6 min) on every code change | Edit file on volume, next pod picks it up |
| Auth complexity | GHCR PAT, RunPod registry credentials | None (base image is public, RunPod-mirrored) |
| Cold start (first pod ever) | Pull 3-4 GB + load FLUX | Install 3 GB pip deps once + load FLUX |
| Cold start (Nth pod) | Pull 3-4 GB + load FLUX | Reuse venv + load FLUX (~30 s total) |
| Bus factor on infra | Need to remember GHCR + workflow | One file on the volume |

The only thing we lose is hermetic image reproducibility. For a personal-use platform, the trade-off is overwhelmingly worth it.

## 5. Concrete file changes

### Add
- **`gpu-server/startup.sh`** — pod boot script (the 12 lines above). This file is *also* uploaded to the volume; the copy in git is the source of truth.
- **`gpu-server/requirements.txt`** — flat list of runtime deps (extracted from `requirements.serverless.txt`). Lives on the volume too.
- **`gpu-server/bootstrap-volume.sh`** — VPS-side helper script that uploads the three files (serve.py, handler.py, requirements.txt, startup.sh) onto the network volume via a one-shot RunPod pod. See §7.

### Edit
- **`backend/services/runpod_pods.py`**
  - Switch from GraphQL `podFindAndDeployOnDemand` to REST `POST /v1/pods` (matches RunPod's documented public API)
  - Image becomes `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`
  - Pass `gpuTypeIds` as a list (RunPod handles the fallback natively — replaces our manual loop)
  - Pass `dockerStartCmd: ["bash", "/runpod-volume/forge-app/startup.sh"]`
  - Drop the `dockerArgs` field entirely (it's a GraphQL-only thing)
  - Drop the `containerRegistryAuthId` plumbing
- **`backend/services/forge_pod_manager.py`**
  - Drop the `HF_TOKEN` env var passthrough? **Keep it** — needed if the volume cache is ever cleared
  - Same connect/heartbeat/disconnect logic, no behavioural change
- **`backend/config.py`**
  - `FORGE_POD_IMAGE` default → `"runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"`
  - `FORGE_POD_REGISTRY_AUTH_ID` → can be deleted (no auth needed for public base image)

### Remove
- **`.github/workflows/build-forge-image.yml`** — no more custom image, no GHA build needed
- **`gpu-server/Dockerfile.serverless`** — no more custom image
- **`gpu-server/requirements.serverless.txt`** — replaced by `requirements.txt` (same content, new name + new home)

### Untouched
- **`gpu-server/serve.py`** — keep as-is, just gets uploaded to the volume now
- **`gpu-server/handler.py`** — same
- **All Forge backend orchestration** (forge_pod_manager.py, forge_pod_client.py, forge_pod_reaper.py, routes_forge.py, ForgePod/ForgeSession models, migration 007) — unchanged
- **All Forge frontend code** (forge-pod-control.tsx, forge-shell.tsx, image/page.tsx) — unchanged

## 6. Implementation phases

### Phase 0 — Wait for the user to finish VPS restore
**Owner**: User
- Restore VPS from a pre-incident backup (ideally before 22:00 UTC Apr 29) OR from the 07:26 UTC Apr 30 backup with a manual `docker image prune -a -f` immediately after first boot.
- Verify all services up: `docker compose ps` shows backend, worker, frontend healthy.
- Trigger `gh workflow run deploy-vps.yml` from outside the VPS to bring code state to current `main`.

### Phase 1 — Code changes (no VPS contact)
**Owner**: Me
- Add `gpu-server/startup.sh`, `gpu-server/requirements.txt`, `gpu-server/bootstrap-volume.sh`
- Rewrite `backend/services/runpod_pods.py` to use REST API
- Update `backend/config.py` defaults
- Delete `.github/workflows/build-forge-image.yml`, `gpu-server/Dockerfile.serverless`, `gpu-server/requirements.serverless.txt`
- Local validation: ruff + tsc + smoke imports
- Commit + push (CI deploys to VPS via existing `deploy-vps.yml`)

### Phase 2 — Volume bootstrap (one-shot)
**Owner**: User runs the script, I prepare it
**Where it runs**: **Your laptop. Not the VPS.** The script makes outbound RunPod
API calls only — no VPS-side state involved.

- Run `gpu-server/bootstrap-volume.sh` from your laptop:
  - Deploys a tiny alpine pod with the volume mounted
  - `scp`'s the four files (serve.py, handler.py, requirements.txt, startup.sh) from your local checkout into `/runpod-volume/forge-app/` on that pod
  - Terminates the pod
- Verify with a second small pod: `ls /runpod-volume/forge-app/` returns the four files
- This is a one-time operation. Future code updates are *just edits* to the same paths via the same script.

### Phase 3 — End-to-end test
**Owner**: User clicks, I monitor
- User clicks **Connect GPU** in the Forge UI
- Backend deploys via REST `POST /v1/pods`
- Pod pulls runpod/pytorch (~10s), runs `startup.sh`
- First-time: venv creation + pip install (~3 min). Second-time: <30s.
- serve.py imports handler → FLUX loads from cache
- serve.py self-registers → backend marks pod ready → pill green
- User submits a prompt → image returns

### Phase 4 — Polish
**Owner**: Me
- Update `FORGE_PODS_PLAN.md` (this file) with what we learned
- Memory note about the volume-bootstrap pattern so future sessions don't re-invent the wheel
- Consider: a `gpu-server/sync-volume.sh` helper for fast code updates (`scp` files into a one-shot pod)

## 7. Volume bootstrap details

**Runs from your laptop. Not the VPS.** This is a one-time operation; all
subsequent code changes use the same flow.

How it works:
1. Script reads `RUNPOD_API_KEY` from your local environment (or a `.env`
   you point at).
2. Script generates an ephemeral SSH keypair just for this operation.
3. Deploys a tiny alpine pod with:
   - The Forge network volume mounted at `/runpod-volume`
   - Port 22 exposed
   - The freshly-generated public key in `PUBLIC_KEY` env var (alpine's
     entrypoint writes it to `/root/.ssh/authorized_keys` then runs sshd)
4. Polls until the pod has a runtime + public SSH endpoint.
5. `scp -i <ephemeral-key>` the four files (`serve.py`, `handler.py`,
   `requirements.txt`, `startup.sh`) from your local
   `gpu-server/` into `/runpod-volume/forge-app/` on the pod.
6. Terminates the pod. Volume retains the files.

`bootstrap-volume.sh` is idempotent — safe to re-run any time you want to
push fresh code (it just overwrites the four files). The ephemeral key is
discarded after the script exits.

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| First-pod pip install takes >5 min | Low-medium | UI already shows provisioning state with no time pressure; user can walk away |
| pip install fails inside the pod | Low | requirements.txt is identical to what we tested in the GHA build; if it breaks, restart pod is cheap |
| Volume corruption from concurrent writes | Very low | Only one pod active at a time per the manager; no concurrent writes to forge-app/ |
| Code on volume drifts from git | Medium long-term | Add a version-stamp file written at deploy time; serve.py logs the stamp on boot. Concrete: §10 follow-up. |
| RunPod base image gets retired | Low | Pin to specific tag; document the tag we depend on |
| **NO VPS-SIDE CHANGES from me without explicit ask** | — | Hard rule for the rest of this work |

## 9. Rollback plan

If Phase 3 fails:
1. The deployed code on `main` is the new REST-based one. To roll back to the (broken) GraphQL/custom-image flow: `git revert <plan-implementation-commit>` and re-deploy.
2. The volume's `forge-app/` directory is harmless if no pods reference it.
3. No backend DB rollback needed — `ForgePod` and `ForgeSession` schemas are unchanged.

If a deploy goes wrong mid-Phase 1:
- Standard `git revert` flow on `main`. CI re-deploys the previous code.

## 10. Open questions / follow-ups

- **Code freshness**: how do we ensure the volume's `forge-app/` matches `main`? A simple version-stamp file plus a heartbeat comparison in `serve.py` would surface drift.
- **Multi-pod sync**: if we ever scale to >1 pod, all pods share the volume. We assume read-only at runtime; pip-install only happens once (guarded by `[ ! -d venv ]`).
- **Volume backup**: the FLUX cache + venv together are ~30 GB. Worth backing up the volume periodically? RunPod has snapshots. Cheap insurance.
- **Token rotation**: HF_TOKEN, GPU_API_KEY, GPU_REGISTRATION_KEY, RUNPOD_API_KEY all currently in VPS `.env`. Pre-launch rotation list — outside this plan's scope.

## 11. What I will NOT do

- Touch the VPS via SSH without explicit user consent.
- Run `docker pull` or any disk-eating command on the VPS.
- Make changes to RunPod resources (pods/templates/endpoints) without surfacing the diff first.
- Add new diagnostic loops that thrash the box.

## 12. Estimated effort

- Phase 1 (code changes): ~90 min me
- Phase 2 (volume bootstrap): ~15 min user, after the script is ready
- Phase 3 (test): ~10 min user
- Total wall clock: half a day, conservatively, with verification.

---

**Next action**: User finishes VPS restore + redeploy. Once confirmed, I begin Phase 1 (code changes only, no VPS contact).
