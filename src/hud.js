// ============================================================================
// POLE POSITION 2026 — GRAND PRIX MOTORSPORT SIM
// Sim Telemetry HUD, Live Lap Delta Ring, Pedal/Assist Bars, Car MFD & Vector Map
// ============================================================================

import { TIRE_COMPOUNDS, FUJI_SECTORS, PIT_LANE_CONFIG } from './config.js?v=20261114fix';

const DELTA_BIN_COUNT = 100;
const TRACK_SPLINE_LEN = 1000;

export function formatLapTimeArcade(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--"--';
  const s = Math.max(0, sec);
  const whole = Math.floor(s);
  const centi = Math.floor((s - whole) * 100);
  return `${String(whole).padStart(2, '0')}"${String(centi).padStart(2, '0')}`;
}

export function formatLapTimeSim(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--:--.--';
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  const secs = Math.floor(rem);
  const centi = Math.floor((rem - secs) * 100);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(centi).padStart(2, '0')}`;
}

export function ordinalSuffix(pos) {
  if (pos % 100 >= 11 && pos % 100 <= 13) return `${pos}TH`;
  switch (pos % 10) {
    case 1: return `${pos}ST`;
    case 2: return `${pos}ND`;
    case 3: return `${pos}RD`;
    default: return `${pos}TH`;
  }
}

function tireWearColor(life, punctured) {
  if (punctured || life <= 0.05) return '#ef4444';
  if (life < 0.25) return '#f97316';
  if (life < 0.50) return '#f59e0b';
  if (life < 0.75) return '#eab308';
  return '#10b981';
}

function tireTempColor(tempC) {
  if (!Number.isFinite(tempC)) return '#cbd5e1';
  if (tempC < 72) return '#38bdf8';   // Cold slicks (blue)
  if (tempC <= 106) return '#10b981'; // Optimal operating window (emerald)
  if (tempC <= 116) return '#f59e0b'; // Overheating (amber)
  return '#ef4444';                   // Blistering (red)
}

function tireTempBgTint(tempC) {
  if (!Number.isFinite(tempC)) return 'rgba(8, 13, 23, 0.78)';
  if (tempC < 72) return 'rgba(14, 42, 74, 0.62)';
  if (tempC <= 106) return 'rgba(8, 38, 30, 0.58)';
  if (tempC <= 116) return 'rgba(58, 34, 10, 0.64)';
  return 'rgba(68, 16, 22, 0.68)';
}

function damageColor(val) {
  const v = Number(val) || 0;
  if (v > 0.65) return '#ef4444';
  if (v > 0.28) return '#f59e0b';
  if (v > 0.05) return '#facc15';
  return '#10b981';
}

export class TelemetryHUD {
  constructor(track, raceSystems, callbacks = {}) {
    this.track = track;
    this.raceSystems = raceSystems;
    this.callbacks = callbacks;
    this.pitDrawerOpen = false;
    this.speedUnit = 'KMH';
    this.bannerTimeout = null;
    this._lastDisplayedGear = 1;
    this._shiftPulseTimer = null;
    this._mapLogicalW = 0;
    this._mapLogicalH = 0;
    this._mapDpr = 1;
    this._bestMacroSectorTimes = [null, null, null];
    this._sectorDeltaPopup = null;

    // 100-bin s-indexed Live Lap Delta Ring
    this._curLapBins = new Float64Array(DELTA_BIN_COUNT).fill(-1);
    this._bestLapBins = null;
    this._bestLapRefDuration = null;
    this._deltaPrevBin = -1;
    this._deltaPrevLapCount = -1;
    this._deltaLapInvalid = false;
    this._smoothedLiveDeltaSec = 0;

    this._cacheElements();
    this._bindStrategyButtons();
    this._prepareMinimapStaticPath();
  }

  _cacheElements() {
    this.hudRoot = document.getElementById('race-hud');
    this.scoreCardEl = document.getElementById('hud-score-card') || document.querySelector('.hud-stat.stat-score');
    this.scoreEl = document.getElementById('hud-score');
    this.topScoreEl = document.getElementById('hud-top-score');
    this.timerEl = document.getElementById('hud-timer');
    this.timerLabelEl = document.getElementById('hud-timer-label');
    this.lapEl = document.getElementById('hud-lap');
    this.posEl = document.getElementById('hud-position');
    this.lapTimeEl = document.getElementById('hud-lap-time');
    this.bestLapEl = document.getElementById('hud-best-lap');
    this.deltaValEl = document.getElementById('hud-delta-val');
    this.deltaBarWrapEl = document.getElementById('hud-delta-bar-wrap');
    this.deltaBarFillEl = document.getElementById('hud-delta-bar-fill');
    this.sectorReadoutEl = document.getElementById('hud-sector-readout');
    this.speedUnitLabelEl = document.getElementById('hud-speed-unit-lbl') || document.querySelector('.speed-col .stat-lbl');
    this.speedKmhEl = document.getElementById('hud-speed-kmh');
    this.speedMphEl = document.getElementById('hud-speed-mph');
    this.throttleBarEl = document.getElementById('hud-throttle-bar');
    this.brakeManualBarEl = document.getElementById('hud-brake-manual-bar');
    this.brakeAssistBarEl = document.getElementById('hud-brake-assist-bar');
    this.gearBoxEl = document.getElementById('hud-gear-box');
    this.gearValEl = document.getElementById('hud-gear-val');
    this.gearModeEl = document.getElementById('hud-gear-mode');
    this.rpmFillEl = document.getElementById('hud-rpm-fill');
    this.slipBadgeEl = document.getElementById('hud-slipstream-badge');

    // 2026 Telemetry MFD
    this.telemetryPanelEl = document.getElementById('telemetry-2026-panel');
    this.compoundBadgeEl = document.getElementById('tel-compound-badge');
    this.assistBadgeEl = document.getElementById('tel-assist-badge');
    this.tireBoxes = {
      FL: document.getElementById('tire-box-FL'),
      FR: document.getElementById('tire-box-FR'),
      RL: document.getElementById('tire-box-RL'),
      RR: document.getElementById('tire-box-RR'),
    };
    this.fuelValEl = document.getElementById('tel-fuel-val');
    this.fuelFillEl = document.getElementById('tel-fuel-fill');
    this.weatherCurEl = document.getElementById('tel-weather-cur');
    this.weatherNextEl = document.getElementById('tel-weather-next');
    this.moistureValEl = document.getElementById('tel-moisture-val');

    // Damage Chips + Top-Down Car Silhouette SVG Nodes
    this.dmgFwEl = document.getElementById('dmg-part-fw');
    this.dmgRwEl = document.getElementById('dmg-part-rw');
    this.dmgSuspEl = document.getElementById('dmg-part-susp');
    this.dmgPuncEl = document.getElementById('dmg-part-punc');
    this.svgFwLEl = document.getElementById('dmg-svg-fw-l');
    this.svgFwREl = document.getElementById('dmg-svg-fw-r');
    this.svgSuspFEl = document.getElementById('dmg-svg-susp-f');
    this.svgSuspREl = document.getElementById('dmg-svg-susp-r');
    this.svgRwEl = document.getElementById('dmg-svg-rw');

    // Caution / Radio Banners
    this.cautionBannerEl = document.getElementById('caution-banner');
    this.radioToastEl = document.getElementById('engineer-radio-toast');
    this.centerCalloutEl = document.getElementById('center-callout');

    // Pre-Pit Strategy Drawer, BOX THIS LAP & Pit Stop Clutch Overlay
    this.pitActionRowEl = document.getElementById('pit-action-row');
    this.boxRequestBtn = document.getElementById('btn-request-box');
    this.pitToggleBtn = document.getElementById('btn-toggle-pit-strategy');
    this.pitDrawerEl = document.getElementById('pit-strategy-drawer');
    this.pitApproachHintEl = document.getElementById('pit-approach-hint');

    this.pitStopOverlayEl = document.getElementById('pit-stop-overlay');
    this.pitServiceStatusEl = document.getElementById('pit-service-status');
    this.pitServiceTimerEl = document.getElementById('pit-service-timer');
    this.clutchWrapEl = document.getElementById('clutch-minigame-wrap');
    this.clutchGoodZoneEl = document.querySelector('.clutch-good-zone');
    this.clutchSweetZoneEl = document.querySelector('.clutch-sweet-zone');
    this.clutchCursorEl = document.getElementById('clutch-cursor');
    this.clutchResultEl = document.getElementById('clutch-result-text');
    this.clutchReleaseBtn = document.getElementById('btn-clutch-release');

    // Minimap
    this.minimapCanvas = document.getElementById('gps-minimap');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
  }

  setSpeedUnit(unit = 'KMH') {
    this.speedUnit = unit === 'MPH' ? 'MPH' : 'KMH';
  }

  resetSectorSplits() {
    this._bestMacroSectorTimes = [null, null, null];
    this._sectorDeltaPopup = null;
    this._curLapBins.fill(-1);
    this._bestLapBins = null;
    this._bestLapRefDuration = null;
    this._deltaPrevBin = -1;
    this._deltaPrevLapCount = -1;
    this._deltaLapInvalid = false;
    this._smoothedLiveDeltaSec = 0;
    if (this.deltaValEl) {
      this.deltaValEl.textContent = '±0.00s';
      this.deltaValEl.className = 'delta-pill neutral';
    }
    if (this.deltaBarFillEl) {
      this.deltaBarFillEl.style.left = '50%';
      this.deltaBarFillEl.style.width = '0%';
    }
  }

  _fillBinGaps(bins, totalLapSec) {
    // Fill any skipped spline bins via linear interpolation for smooth continuous delta lookup
    const out = new Float64Array(bins);
    if (out[0] < 0) out[0] = 0;
    let lastValidIdx = 0;
    for (let i = 1; i < DELTA_BIN_COUNT; i++) {
      if (out[i] >= 0) {
        if (i - lastValidIdx > 1) {
          const v0 = out[lastValidIdx];
          const v1 = out[i];
          const span = i - lastValidIdx;
          for (let k = 1; k < span; k++) {
            out[lastValidIdx + k] = v0 + ((v1 - v0) * k) / span;
          }
        }
        lastValidIdx = i;
      }
    }
    if (lastValidIdx < DELTA_BIN_COUNT - 1 && Number.isFinite(totalLapSec) && totalLapSec > 0) {
      const v0 = out[lastValidIdx];
      const span = DELTA_BIN_COUNT - lastValidIdx;
      for (let k = 1; k < span; k++) {
        out[lastValidIdx + k] = v0 + ((totalLapSec - v0) * k) / span;
      }
    }
    return out;
  }

  _updateLiveLapDelta(playerCar, sessionPhase) {
    if (!playerCar) return;
    const totalLen = this.track?.totalLength || TRACK_SPLINE_LEN;
    const sNorm = ((playerCar.s % totalLen) + totalLen) % totalLen;
    const fBin = (sNorm / totalLen) * DELTA_BIN_COUNT;
    const binIdx = Math.max(0, Math.min(DELTA_BIN_COUNT - 1, Math.floor(fBin)));
    const lapCount = playerCar.lapsCompleted || 0;

    if (sessionPhase === 'GRID_COUNTDOWN' || sessionPhase === 'PRE_RACE_MENU') {
      this._curLapBins.fill(-1);
      this._deltaPrevBin = binIdx;
      this._deltaPrevLapCount = lapCount;
      this._deltaLapInvalid = false;
      playerCar.liveLapDeltaSec = 0;
      return;
    }

    if (playerCar.inPitLane) {
      this._deltaLapInvalid = true;
    }

    // Detect lap completion & promote new personal best reference ring
    if (this._deltaPrevLapCount >= 0 && lapCount > this._deltaPrevLapCount) {
      const bestLapSec = playerCar.bestLapTime;
      let validCount = 0;
      for (let i = 0; i < DELTA_BIN_COUNT; i++) {
        if (this._curLapBins[i] >= 0) validCount++;
      }
      const isNewBest = Number.isFinite(bestLapSec) && bestLapSec > 8 && (
        this._bestLapBins === null ||
        this._bestLapRefDuration === null ||
        bestLapSec <= this._bestLapRefDuration + 0.02
      );
      if (!this._deltaLapInvalid && validCount >= 25 && isNewBest) {
        this._bestLapBins = this._fillBinGaps(this._curLapBins, bestLapSec);
        this._bestLapRefDuration = bestLapSec;
      }
      this._curLapBins.fill(-1);
      this._curLapBins[0] = 0;
      this._deltaPrevBin = 0;
      this._deltaLapInvalid = Boolean(playerCar.inPitLane);
    }
    this._deltaPrevLapCount = lapCount;

    // Sample current lap elapsed time into spline bin
    const curLapSec = Math.max(0, playerCar.currentLapTime || 0);
    if (this._curLapBins[binIdx] < 0 || binIdx !== this._deltaPrevBin) {
      if (
        this._deltaPrevBin >= 0 &&
        binIdx > this._deltaPrevBin &&
        binIdx - this._deltaPrevBin <= 8 &&
        this._curLapBins[this._deltaPrevBin] >= 0
      ) {
        const t0 = this._curLapBins[this._deltaPrevBin];
        const span = binIdx - this._deltaPrevBin;
        for (let k = 1; k <= span; k++) {
          this._curLapBins[this._deltaPrevBin + k] = t0 + ((curLapSec - t0) * k) / span;
        }
      } else {
        this._curLapBins[binIdx] = curLapSec;
      }
      this._deltaPrevBin = binIdx;
    }

    // Compute continuous interpolated delta against personal-best reference lap
    if (
      this._bestLapBins &&
      !playerCar.inPitLane &&
      curLapSec > 0.45 &&
      Number.isFinite(this._bestLapRefDuration)
    ) {
      const b0 = binIdx;
      const b1 = (b0 + 1) % DELTA_BIN_COUNT;
      const frac = fBin - Math.floor(fBin);
      const t0 = this._bestLapBins[b0];
      const t1 = b1 === 0 ? this._bestLapRefDuration : this._bestLapBins[b1];
      if (t0 >= 0 && t1 >= t0) {
        const refSec = t0 + (t1 - t0) * frac;
        const rawDelta = Math.max(-9.99, Math.min(9.99, curLapSec - refSec));
        this._smoothedLiveDeltaSec += (rawDelta - this._smoothedLiveDeltaSec) * 0.28;
        const d = this._smoothedLiveDeltaSec;
        playerCar.liveLapDeltaSec = d;

        if (this.deltaValEl) {
          const sign = d <= -0.005 ? '−' : (d >= 0.005 ? '+' : '±');
          this.deltaValEl.textContent = `${sign}${Math.abs(d).toFixed(2)}s`;
          if (d <= -0.02) {
            this.deltaValEl.className = 'delta-pill ahead';
          } else if (d >= 0.02) {
            this.deltaValEl.className = 'delta-pill behind';
          } else {
            this.deltaValEl.className = 'delta-pill neutral';
          }
        }
        if (this.deltaBarFillEl) {
          const norm = Math.max(-1, Math.min(1, d / 1.5)); // ±1.50s full half-bar deflection
          const widthPct = Math.abs(norm) * 50;
          if (norm <= 0) {
            // Faster (emerald bar growing left from center, or right? Standard sim: green grows right or left — let's grow green right for gain, red left for loss)
            this.deltaBarFillEl.style.left = '50%';
            this.deltaBarFillEl.style.width = `${widthPct.toFixed(1)}%`;
            this.deltaBarFillEl.style.backgroundColor = '#10b981';
          } else {
            this.deltaBarFillEl.style.left = `${(50 - widthPct).toFixed(1)}%`;
            this.deltaBarFillEl.style.width = `${widthPct.toFixed(1)}%`;
            this.deltaBarFillEl.style.backgroundColor = '#ef4444';
          }
        }
        return;
      }
    }

    playerCar.liveLapDeltaSec = null;
    if (this.deltaValEl) {
      this.deltaValEl.textContent = this._bestLapBins ? '±0.00s' : 'REF LAP';
      this.deltaValEl.className = 'delta-pill neutral';
    }
    if (this.deltaBarFillEl) {
      this.deltaBarFillEl.style.left = '50%';
      this.deltaBarFillEl.style.width = '0%';
    }
  }

  recordSectorSplit(sectorNum, splitSec) {
    const idx = Math.max(0, Math.min(2, (Number(sectorNum) || 1) - 1));
    if (!Number.isFinite(splitSec) || splitSec <= 2.0 || splitSec >= 120.0) return null;
    const prevBest = this._bestMacroSectorTimes[idx];
    let deltaSec = 0;
    let isPurple = false;
    let color = '#10b981';
    let displayText = '';
    let retroText = '';

    if (prevBest === null) {
      this._bestMacroSectorTimes[idx] = splitSec;
      isPurple = true;
      color = '#c084fc';
      displayText = `S${idx + 1} ${splitSec.toFixed(2)}s (PB)`;
      retroText = `S${idx + 1} ${splitSec.toFixed(2)}S`;
    } else {
      deltaSec = splitSec - prevBest;
      if (splitSec < prevBest) {
        this._bestMacroSectorTimes[idx] = splitSec;
        isPurple = true;
        color = '#c084fc';
        displayText = `S${idx + 1} ${deltaSec.toFixed(2)}s (PB)`;
      } else if (deltaSec <= 0.08) {
        color = '#10b981';
        displayText = `S${idx + 1} +${Math.max(0, deltaSec).toFixed(2)}s`;
      } else {
        color = '#f87171';
        displayText = `S${idx + 1} +${deltaSec.toFixed(2)}s`;
      }
      const sign = deltaSec <= 0 ? '' : '+';
      retroText = `S${idx + 1} ${sign}${deltaSec.toFixed(2)}S`;
    }

    this._sectorDeltaPopup = {
      sector: idx + 1,
      deltaSec,
      isPurple,
      color,
      displayText,
      text: retroText,
      expiresAtMs: performance.now() + 2500,
    };
    return this._sectorDeltaPopup;
  }

  getActiveSectorDeltaPopup() {
    if (!this._sectorDeltaPopup) return null;
    if (performance.now() > this._sectorDeltaPopup.expiresAtMs) {
      this._sectorDeltaPopup = null;
      return null;
    }
    return this._sectorDeltaPopup;
  }

  _bindStrategyButtons() {
    if (this.boxRequestBtn) {
      this.boxRequestBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onRequestBox) this.callbacks.onRequestBox();
      });
    }

    if (this.pitToggleBtn) {
      this.pitToggleBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePitDrawer();
      });
    }

    const closeBtn = document.getElementById('btn-close-pit-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePitDrawer(false);
      });
    }

    document.querySelectorAll('[data-pit-compound]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.raceSystems.playerPitPlan.nextCompound = btn.dataset.pitCompound;
        this._syncPitStrategyHighlight();
      });
    });

    document.querySelectorAll('[data-pit-fuel]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = btn.dataset.pitFuel;
        this.raceSystems.playerPitPlan.fuelToAdd = val === 'FILL' ? 'FILL' : Number(val);
        this._syncPitStrategyHighlight();
      });
    });

    document.querySelectorAll('[data-pit-repair]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.raceSystems.playerPitPlan.repairOrder = btn.dataset.pitRepair;
        this._syncPitStrategyHighlight();
      });
    });

    document.querySelectorAll('[data-pit-push]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.raceSystems.playerPitPlan.crewPushMode = btn.dataset.pitPush;
        this._syncPitStrategyHighlight();
      });
    });

    if (this.clutchReleaseBtn) {
      this.clutchReleaseBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onClutchButton) this.callbacks.onClutchButton();
      });
    }

    this._syncPitStrategyHighlight();
  }

  togglePitDrawer(forceState) {
    this.pitDrawerOpen = forceState !== undefined ? forceState : !this.pitDrawerOpen;
    if (this.pitDrawerEl) {
      this.pitDrawerEl.classList.toggle('open', this.pitDrawerOpen);
    }
    this._syncPitStrategyHighlight();
  }

  _syncPitStrategyHighlight() {
    const plan = this.raceSystems.playerPitPlan;
    document.querySelectorAll('[data-pit-compound]').forEach((b) =>
      b.classList.toggle('active', b.dataset.pitCompound === plan.nextCompound)
    );
    document.querySelectorAll('[data-pit-fuel]').forEach((b) =>
      b.classList.toggle('active', String(b.dataset.pitFuel) === String(plan.fuelToAdd))
    );
    document.querySelectorAll('[data-pit-repair]').forEach((b) =>
      b.classList.toggle('active', b.dataset.pitRepair === plan.repairOrder)
    );
    document.querySelectorAll('[data-pit-push]').forEach((b) =>
      b.classList.toggle('active', b.dataset.pitPush === plan.crewPushMode)
    );
    if (this.pitToggleBtn) {
      const cShort = TIRE_COMPOUNDS[plan.nextCompound]?.short || 'M';
      this.pitToggleBtn.innerHTML = `<b>${cShort}</b> +${plan.fuelToAdd === 'FILL' ? 'END' : plan.fuelToAdd + 'L'}`;
    }
    this.syncBoxButtonState();
  }

  syncBoxButtonState() {
    if (!this.boxRequestBtn) return;
    const armed = !!this.raceSystems.boxThisLapRequested;
    this.boxRequestBtn.classList.toggle('armed', armed);
    this.boxRequestBtn.textContent = armed ? 'BOX IN' : 'BOX';
  }

  triggerGearShiftPulse(shiftDir = 'UP') {
    if (!this.gearBoxEl) return;
    this.gearBoxEl.classList.remove('shift-pulse-up', 'shift-pulse-down');
    this.gearBoxEl.classList.add(shiftDir === 'DOWN' ? 'shift-pulse-down' : 'shift-pulse-up');
    clearTimeout(this._shiftPulseTimer);
    this._shiftPulseTimer = setTimeout(() => {
      this.gearBoxEl?.classList.remove('shift-pulse-up', 'shift-pulse-down');
    }, 150);
  }

  showCenterCallout(text, durationMs = 1900, color = '#ffffff') {
    if (!this.centerCalloutEl) return;
    this.centerCalloutEl.textContent = text;
    this.centerCalloutEl.style.color = color;
    this.centerCalloutEl.classList.add('visible');
    clearTimeout(this._calloutTimer);
    this._calloutTimer = setTimeout(() => {
      this.centerCalloutEl.classList.remove('visible');
    }, durationMs);
  }

  showEngineerRadio(message) {
    if (!this.radioToastEl) return;
    this.radioToastEl.innerHTML = `<span class="radio-tag">RACE ENGINEER</span> ${message}`;
    this.radioToastEl.classList.add('visible');
    clearTimeout(this._radioTimer);
    this._radioTimer = setTimeout(() => {
      this.radioToastEl.classList.remove('visible');
    }, 4200);
  }

  setModeVisibility(mode) {
    const is2026 = mode === '2026_UPDATED';
    document.body.classList.toggle('sim-2026-active', is2026);
    if (this.scoreCardEl) this.scoreCardEl.style.display = is2026 ? 'none' : '';
    if (this.telemetryPanelEl) this.telemetryPanelEl.style.display = is2026 ? 'flex' : 'none';
    if (this.pitActionRowEl) this.pitActionRowEl.style.display = is2026 ? 'flex' : 'none';
    if (this.pitToggleBtn) this.pitToggleBtn.style.display = is2026 ? 'inline-flex' : 'none';
    if (this.boxRequestBtn) this.boxRequestBtn.style.display = is2026 ? 'inline-flex' : 'none';
    if (!is2026) this.togglePitDrawer(false);
  }

  update(state) {
    const {
      gameMode,
      sessionPhase,
      score,
      topScore,
      timerDisplaySec,
      timerLabel,
      currentLap,
      totalLaps,
      playerPos,
      totalCars,
      playerCar,
      allCars,
      weatherSummary,
      brakingAssistMode,
      tractionControlMode,
    } = state;

    const isSim2026 = gameMode === '2026_UPDATED';
    const fmtLap = isSim2026 ? formatLapTimeSim : formatLapTimeArcade;

    if (!isSim2026) {
      if (this.scoreEl) this.scoreEl.textContent = String(Math.floor(score)).padStart(6, '0');
      if (this.topScoreEl) this.topScoreEl.textContent = String(Math.floor(topScore)).padStart(6, '0');
    }

    if (this.timerLabelEl) this.timerLabelEl.textContent = timerLabel;
    if (this.timerEl) {
      const tVal = Math.max(0, timerDisplaySec);
      this.timerEl.textContent = gameMode === '1982_ORIGINAL'
        ? Math.ceil(tVal).toString().padStart(2, '0')
        : fmtLap(tVal);
      this.timerEl.classList.toggle('low-time', gameMode === '1982_ORIGINAL' && tVal <= 12);
    }

    if (this.lapEl) {
      this.lapEl.textContent = sessionPhase === 'QUALIFYING'
        ? 'QUALI 1/1'
        : `LAP ${Math.min(currentLap, totalLaps)}/${totalLaps}`;
    }

    if (this.posEl) {
      this.posEl.innerHTML = isSim2026
        ? `P${playerPos}<small>/${totalCars}</small>`
        : `${ordinalSuffix(playerPos)}<small>/${totalCars}</small>`;
      this.posEl.style.color = playerPos === 1 ? '#f5b700' : (playerPos <= 3 ? '#10b981' : '#f8fafc');
    }

    if (this.lapTimeEl) this.lapTimeEl.textContent = fmtLap(playerCar.currentLapTime);
    if (this.bestLapEl) {
      if (playerCar.bestLapTime) {
        const formattedBest = `BEST ${fmtLap(playerCar.bestLapTime)}`;
        if (this._lastBestLapTime !== playerCar.bestLapTime) {
          this._lastBestLapTime = playerCar.bestLapTime;
          this.bestLapEl.style.color = '#c084fc';
          clearTimeout(this._bestPulseTimer);
          this._bestPulseTimer = setTimeout(() => {
            if (this.bestLapEl) this.bestLapEl.style.color = '';
          }, 2600);
        }
        this.bestLapEl.textContent = formattedBest;
      } else {
        this._lastBestLapTime = null;
        this.bestLapEl.textContent = isSim2026 ? 'BEST --:--.--' : 'BEST --"--';
      }
    }

    // Continuous 100-bin s-indexed Live Lap Delta
    this._updateLiveLapDelta(playerCar, sessionPhase);

    if (this.sectorReadoutEl) {
      const sec = this.track.getSector(playerCar.s);
      if (!playerCar.inPitLane && this._lastSectorId !== sec.id) {
        this._lastSectorId = sec.id;
        this.sectorReadoutEl.style.color = '#00d2be';
        clearTimeout(this._secPulseTimer);
        this._secPulseTimer = setTimeout(() => {
          if (this.sectorReadoutEl) this.sectorReadoutEl.style.color = '';
        }, 700);
      }
      const activeSplitPopup = !playerCar.inPitLane ? this.getActiveSectorDeltaPopup() : null;
      if (playerCar.inPitLane) {
        this.sectorReadoutEl.textContent = 'PIT LANE';
        this.sectorReadoutEl.style.color = '';
      } else if (activeSplitPopup) {
        this.sectorReadoutEl.textContent = activeSplitPopup.displayText;
        this.sectorReadoutEl.style.color = activeSplitPopup.color;
      } else if (sessionPhase !== 'QUALIFYING' && Array.isArray(allCars) && allCars.length > 1) {
        const mPerGameM = this.track.metersPerGameUnit || this.track.realMetersPerGameMeter || 4.54;
        const pDist = playerCar.totalDistanceGameM || 0;
        let aheadCar = null;
        let aheadDelta = Infinity;
        let behindCar = null;
        let behindDelta = Infinity;
        for (const c of allCars) {
          if (c.isPlayer || c.exploded) continue;
          const d = (c.totalDistanceGameM || 0) - pDist;
          if (d > 0 && d < aheadDelta) {
            aheadDelta = d;
            aheadCar = c;
          } else if (d <= 0 && -d < behindDelta) {
            behindDelta = -d;
            behindCar = c;
          }
        }
        const refCar = playerPos === 1 ? behindCar : (aheadCar || behindCar);
        const refDeltaM = (playerPos === 1 ? behindDelta : (aheadCar ? aheadDelta : behindDelta)) * mPerGameM;
        if (refCar && isFinite(refDeltaM)) {
          const avgSpdMs = Math.max(48, ((playerCar.speedKmh + refCar.speedKmh) * 0.5) / 3.6);
          const gapSec = Math.min(99.9, refDeltaM / avgSpdMs);
          this.sectorReadoutEl.textContent = playerPos === 1
            ? `S${sec.id} • GAP +${gapSec.toFixed(1)}s`
            : `S${sec.id} • INT -${gapSec.toFixed(1)}s`;
        } else {
          this.sectorReadoutEl.textContent = `S${sec.id}`;
        }
      } else {
        this.sectorReadoutEl.textContent = `S${sec.id}`;
      }
    }

    // Speed & Live Pedal + Brake-Assist Telemetry Bars
    const kmh = Math.round(playerCar.speedKmh);
    const mph = Math.round(playerCar.speedKmh * 0.621371);
    if (this.speedUnit === 'MPH') {
      if (this.speedUnitLabelEl) this.speedUnitLabelEl.textContent = 'MPH';
      if (this.speedKmhEl) this.speedKmhEl.textContent = String(mph).padStart(3, '0');
      if (this.speedMphEl) this.speedMphEl.textContent = `${kmh} KM/H`;
    } else {
      if (this.speedUnitLabelEl) this.speedUnitLabelEl.textContent = 'KM/H';
      if (this.speedKmhEl) this.speedKmhEl.textContent = String(kmh).padStart(3, '0');
      if (this.speedMphEl) this.speedMphEl.textContent = `${mph} MPH`;
    }

    const throttlePct = Math.max(0, Math.min(100, (playerCar.throttleInput || 0) * 100));
    const assistBrake = Math.max(
      0,
      Math.min(1, Number(playerCar.assistBrakeApplied) || (playerCar.brakeAssistActive ? 0.35 : 0))
    );
    const rawBrake = Math.max(0, Math.min(1, Number(playerCar.brakeInput) || 0));
    const manualBrake = assistBrake > 0.01 && Math.abs(rawBrake - assistBrake) < 0.02
      ? 0
      : rawBrake;
    const totalBrakePct = Math.max(manualBrake, assistBrake) * 100;
    const manualBrakePct = manualBrake * 100;

    if (this.throttleBarEl) {
      this.throttleBarEl.style.height = `${throttlePct.toFixed(1)}%`;
    }
    if (this.brakeManualBarEl) {
      this.brakeManualBarEl.style.height = `${manualBrakePct.toFixed(1)}%`;
    }
    if (this.brakeAssistBarEl) {
      this.brakeAssistBarEl.style.height = assistBrake > 0.01 ? `${totalBrakePct.toFixed(1)}%` : '0%';
    }

    if (playerCar.gear !== this._lastDisplayedGear) {
      this.triggerGearShiftPulse(playerCar.gear > this._lastDisplayedGear ? 'UP' : 'DOWN');
      this._lastDisplayedGear = playerCar.gear;
    }

    if (this.gearValEl) {
      if (playerCar.gearboxMode === 'CLASSIC_2SPD') {
        this.gearValEl.textContent = playerCar.gear >= 2 ? 'HI' : 'LO';
      } else {
        this.gearValEl.textContent = `G${playerCar.gear}`;
      }
    }
    if (this.gearModeEl) {
      this.gearModeEl.textContent = playerCar.gearboxMode === 'AUTO_8SPD'
        ? 'AUTO 8'
        : (playerCar.gearboxMode === 'CLASSIC_2SPD' ? '82 MAN' : 'MAN 8');
    }

    if (this.rpmFillEl) {
      const rpmPct = Math.max(6, Math.min(100, ((playerCar.rpm - 3600) / 9200) * 100));
      this.rpmFillEl.style.width = `${rpmPct.toFixed(1)}%`;
      if (playerCar.overRevTimer > 0) {
        this.rpmFillEl.style.background = '#ef4444';
      } else if (rpmPct > 86) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #10b981 0%, #f5b700 50%, #e10600 78%, #00d2be 100%)';
      } else if (rpmPct > 68) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #10b981 0%, #f5b700 62%, #e10600 100%)';
      } else if (rpmPct > 48) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #10b981 0%, #f5b700 100%)';
      } else {
        this.rpmFillEl.style.background = '#10b981';
      }
      this.rpmFillEl.classList.toggle('shift-flash', rpmPct > 91 || playerCar.overRevTimer > 0);
    }

    if (this.slipBadgeEl) {
      const drsHighSpeed = Boolean(playerCar.drsActive) || (!playerCar.inPitLane && playerCar.speedKmh > 288 && Math.abs(playerCar.steerInput || 0) < 0.22);
      const showDrs = playerCar.inSlipstream || drsHighSpeed;
      this.slipBadgeEl.style.display = showDrs ? 'inline-block' : 'none';
      if (playerCar.inSlipstream) {
        const towKmh = Math.max(5, Math.round((playerCar.slipstreamFactor || 0.5) * 16));
        this.slipBadgeEl.textContent = `DRS +${towKmh}`;
      } else if (drsHighSpeed) {
        this.slipBadgeEl.textContent = 'DRS OPEN';
      }
    }

    // Caution / Yellow Flag / Illegal Pass Banner
    this._updateCautionBanner(playerCar);

    // 2026 Sim Car MFD & Pit Overlays
    if (isSim2026) {
      this._update2026Telemetry(
        playerCar,
        weatherSummary,
        sessionPhase,
        brakingAssistMode,
        assistBrake,
        tractionControlMode
      );
    } else if (this.pitStopOverlayEl) {
      this.pitStopOverlayEl.style.display = 'none';
    }

    // Clean Vector Circuit Map
    this._drawMinimap(playerCar, allCars);
  }

  _updateCautionBanner(playerCar) {
    if (!this.cautionBannerEl) return;

    const warn = this.raceSystems.yellowPassWarning;
    if (warn.active) {
      this.cautionBannerEl.style.display = 'block';
      this.cautionBannerEl.className = 'caution-banner penalty-warn';
      this.cautionBannerEl.textContent = `ILLEGAL PASS UNDER YELLOW — YIELD TO ${warn.rivalName} IN ${warn.timer.toFixed(1)}s OR +5s PENALTY`;
      return;
    }

    if (this.raceSystems.vscActive) {
      this.cautionBannerEl.style.display = 'block';
      this.cautionBannerEl.className = 'caution-banner vsc';
      this.cautionBannerEl.textContent = `VIRTUAL SAFETY CAR (160 KM/H DELTA) • PIT WINDOW OPEN (${Math.ceil(this.raceSystems.vscRemainingSec)}s)`;
      return;
    }

    const yellowSet = this.raceSystems.getActiveYellowSectorSet();
    if (yellowSet.size > 0) {
      const secList = Array.from(yellowSet).map((id) => `S${id}`).join(', ');
      const playerSec = this.track.getSector(playerCar.s);
      const inZone = yellowSet.has(playerSec.id);
      this.cautionBannerEl.style.display = 'block';
      this.cautionBannerEl.className = 'caution-banner yellow';
      this.cautionBannerEl.textContent = inZone
        ? `LOCAL YELLOW IN SECTOR ${playerSec.id} — NO OVERTAKING`
        : `YELLOW FLAG IN ${secList} — CAUTION`;
      return;
    }

    this.cautionBannerEl.style.display = 'none';
  }

  _update2026Telemetry(
    playerCar,
    weatherSummary,
    sessionPhase,
    brakingAssistMode = 'MIN',
    assistBrake = 0,
    tractionControlMode = 'FULL'
  ) {
    this.syncBoxButtonState();

    const comp = TIRE_COMPOUNDS[playerCar.compound] || TIRE_COMPOUNDS.SOFT;
    if (this.compoundBadgeEl) {
      this.compoundBadgeEl.textContent = comp.name;
      this.compoundBadgeEl.style.borderColor = comp.colorHex;
      this.compoundBadgeEl.style.color = comp.colorHex;
    }

    if (this.assistBadgeEl) {
      const aMode = brakingAssistMode || 'MIN';
      const tMode = tractionControlMode || playerCar.tractionControl || 'FULL';
      const brkIntervening = assistBrake > 0.02;
      const tcsIntervening = Boolean(playerCar.tcsActive || playerCar.escActive || (Number(playerCar.tcsIntervention) || 0) > 0.04);
      const intervening = brkIntervening || tcsIntervening;
      if (brkIntervening) {
        this.assistBadgeEl.textContent = `BRK AST ${Math.round(assistBrake * 100)}%`;
      } else if (tcsIntervening) {
        this.assistBadgeEl.textContent = `TCS+ESC ACTIVE`;
      } else {
        this.assistBadgeEl.textContent = `TC ${tMode} • BRK ${aMode}`;
      }
      this.assistBadgeEl.classList.toggle('intervening', intervening);
    }

    const cornerOrder = ['FL', 'FR', 'RL', 'RR'];
    let maxFlatSpot = 0;
    for (let idx = 0; idx < cornerOrder.length; idx++) {
      const k = cornerOrder[idx];
      const box = this.tireBoxes[k];
      if (!box) continue;
      const t = playerCar.tires[k];
      const pct = Math.max(0, Math.round(t.life * 100));
      const dynTemp = Array.isArray(playerCar.tireTempsC) && Number.isFinite(playerCar.tireTempsC[idx])
        ? playerCar.tireTempsC[idx]
        : t.temp;
      const flatVal = Array.isArray(playerCar.tireFlatSpot)
        ? (playerCar.tireFlatSpot[idx] || 0)
        : (t.flatSpot || 0);
      if (flatVal > maxFlatSpot) maxFlatSpot = flatVal;

      const wearCol = tireWearColor(t.life, t.punctured);
      const tempCol = tireTempColor(dynTemp);
      box.style.borderColor = t.punctured ? '#ef4444' : (flatVal > 0.25 ? '#f59e0b' : wearCol);
      box.style.background = tireTempBgTint(dynTemp);
      box.innerHTML = `
        <div class="tire-cell-top">
          <span class="t-corner">${k}</span>
          <span class="t-temp" style="color:${tempCol}">${Math.round(dynTemp)}°C</span>
        </div>
        <div class="tire-cell-bot">
          <span class="t-pct" style="color:${wearCol}">${t.punctured ? 'PUNC' : pct + '%'}</span>
          ${flatVal > 0.12 ? '<span class="t-flat">FLAT</span>' : ''}
        </div>
        <span class="t-wear-bar" style="width:${t.punctured ? 100 : pct}%;background:${wearCol}"></span>
      `;
    }

    // Fuel Laps + Mass (kg)
    const fuel = playerCar.fuelLaps;
    const fuelKg = Number.isFinite(playerCar.fuelKg) ? playerCar.fuelKg : Math.max(0, fuel * 1.65);
    if (this.fuelValEl) {
      this.fuelValEl.textContent = `${fuel.toFixed(1)}L • ${fuelKg.toFixed(1)} KG`;
      this.fuelValEl.style.color = fuel < 1.5 ? '#ef4444' : '#e2e8f0';
    }
    if (this.fuelFillEl) {
      const fpct = Math.max(0, Math.min(100, (fuel / Math.max(1, playerCar.maxFuelLaps)) * 100));
      this.fuelFillEl.style.width = `${fpct}%`;
      this.fuelFillEl.style.background = fuel < 1.5
        ? '#ef4444'
        : 'linear-gradient(90deg, #0284c7, #00d2be)';
    }

    // Weather & Track Wetness
    if (weatherSummary) {
      if (this.weatherCurEl) {
        this.weatherCurEl.textContent = weatherSummary.current.label;
      }
      if (this.weatherNextEl) {
        this.weatherNextEl.textContent = '';
      }
      if (this.moistureValEl) {
        const gPct = Math.round(weatherSummary.grooveMoisture * 100);
        const oPct = Math.round(weatherSummary.offLineMoisture * 100);
        this.moistureValEl.textContent = `WET: ${gPct}% LINE / ${oPct}% OFF`;
      }
    }

    // 4-Zone Damage Chips + Top-Down F1 Chassis SVG Silhouette
    const d = playerCar.damage || { frontWing: 0, rearWing: 0, suspension: 0, hasPuncture: false };
    const fwLeft = Number.isFinite(d.frontWingLeft) ? d.frontWingLeft : d.frontWing;
    const fwRight = Number.isFinite(d.frontWingRight) ? d.frontWingRight : d.frontWing;
    const fwCol = damageColor(Math.max(d.frontWing || 0, fwLeft || 0, fwRight || 0));
    const rwCol = damageColor(d.rearWing);
    const suspCol = damageColor(d.suspension);
    const flatOrPuncCol = d.hasPuncture ? '#ef4444' : damageColor(maxFlatSpot);

    if (this.dmgFwEl) this.dmgFwEl.style.background = fwCol;
    if (this.dmgRwEl) this.dmgRwEl.style.background = rwCol;
    if (this.dmgSuspEl) this.dmgSuspEl.style.background = suspCol;
    if (this.dmgPuncEl) {
      this.dmgPuncEl.textContent = d.hasPuncture ? 'PUNC' : 'FLAT';
      this.dmgPuncEl.style.background = flatOrPuncCol;
    }

    if (this.svgFwLEl) this.svgFwLEl.setAttribute('fill', damageColor(fwLeft));
    if (this.svgFwREl) this.svgFwREl.setAttribute('fill', damageColor(fwRight));
    if (this.svgSuspFEl) this.svgSuspFEl.setAttribute('stroke', suspCol);
    if (this.svgSuspREl) this.svgSuspREl.setAttribute('stroke', suspCol);
    if (this.svgRwEl) this.svgRwEl.setAttribute('fill', rwCol);

    // Sector 9/10 Pit Entry Approach Hint
    if (this.pitApproachHintEl) {
      const armed = !!this.raceSystems.boxThisLapRequested;
      const nearPitSplit = sessionPhase === 'RACING' && !playerCar.inPitLane && (
        (playerCar.s >= 785 && playerCar.s <= 922) || (armed && playerCar.s >= 720 && playerCar.s <= 926)
      );
      this.pitApproachHintEl.style.display = nearPitSplit ? 'block' : 'none';
      if (nearPitSplit) {
        this.pitApproachHintEl.textContent = armed
          ? 'BOX THIS LAP ARMED — KEEP RIGHT FOR PIT ENTRY (80 KM/H)'
          : 'PIT LANE ENTRY RIGHT (80 KM/H SPEED LIMIT)';
      }
    }

    // Active Pit Stop Crew & Optimal Clutch Release Overlay
    if (this.pitStopOverlayEl) {
      const showPitUI = playerCar.inPitLane;
      this.pitStopOverlayEl.style.display = showPitUI ? 'flex' : 'none';
      if (showPitUI) {
        if (playerCar.pitPhase === 'ENTRY') {
          this.pitServiceStatusEl.textContent = playerCar.pitSpeedingFlagged
            ? 'PIT SPEEDING (+5.0s PENALTY) • PULL INTO BOX'
            : 'PIT LIMITER 80 KM/H • PULL INTO DESIGNATED BOX';
          this.pitServiceTimerEl.textContent = `${Math.round(playerCar.speedKmh)} KM/H`;
          this.clutchWrapEl.style.display = 'none';
        } else if (playerCar.pitPhase === 'STOPPED') {
          const sticky = this.raceSystems.lastStickyGunTriggered ? ' • WHEEL NUT DELAY +3.0s' : '';
          const subPhase = playerCar.pitServiceSubPhase
            || (this.raceSystems.getPitServiceSubPhase ? this.raceSystems.getPitServiceSubPhase(playerCar) : '')
            || `SERVICING (${this.raceSystems.playerPitPlan.nextCompound})`;
          this.pitServiceStatusEl.textContent = `${subPhase}${sticky}`;
          this.pitServiceTimerEl.textContent = `${Math.max(0, playerCar.pitStopTimer).toFixed(2)}s`;

          const cg = this.raceSystems.clutchGame;
          this.clutchWrapEl.style.display = cg.active ? 'flex' : 'none';
          if (cg.active) {
            if (this.raceSystems.getClutchZoneBounds) {
              const zb = this.raceSystems.getClutchZoneBounds();
              if (this.clutchGoodZoneEl) {
                this.clutchGoodZoneEl.style.left = `${(zb.goodMin * 100).toFixed(1)}%`;
                this.clutchGoodZoneEl.style.width = `${((zb.goodMax - zb.goodMin) * 100).toFixed(1)}%`;
              }
              if (this.clutchSweetZoneEl) {
                this.clutchSweetZoneEl.style.left = `${(zb.sweetMin * 100).toFixed(1)}%`;
                this.clutchSweetZoneEl.style.width = `${((zb.sweetMax - zb.sweetMin) * 100).toFixed(1)}%`;
              }
            }
            if (this.clutchCursorEl) {
              this.clutchCursorEl.style.left = `${(cg.cursor * 100).toFixed(1)}%`;
            }
          }
          if (this.clutchResultEl) {
            this.clutchResultEl.textContent = cg.resultText || 'RELEASE CLUTCH IN GREEN ZONE AS JACKS DROP (-0.35s)';
          }
        } else if (playerCar.pitPhase === 'EXIT') {
          this.pitServiceStatusEl.textContent = this.raceSystems.clutchGame.resultText || 'CLEAR TO REJOIN — WATCH TRACK MERGE';
          this.pitServiceTimerEl.textContent = 'PIT EXIT';
          this.clutchWrapEl.style.display = 'none';
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // CLEAN FOM BROADCAST VECTOR CIRCUIT MAP (NO RADAR GRID OR NEON PULSE)
  // --------------------------------------------------------------------------
  _prepareMinimapStaticPath() {
    this.bounds = this.track.computeMinimapBounds();
  }

  refreshTrackMinimap() {
    this.bounds = this.track.computeMinimapBounds();
  }

  _ensureHiDPIMinimap() {
    const canvas = this.minimapCanvas;
    if (!canvas) return { w: 0, h: 0 };
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width > 20 ? Math.round(rect.width) : 160;
    const cssH = rect.height > 20 ? Math.round(rect.height) : 116;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    if (cssW !== this._mapLogicalW || cssH !== this._mapLogicalH || dpr !== this._mapDpr) {
      this._mapLogicalW = cssW;
      this._mapLogicalH = cssH;
      this._mapDpr = dpr;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    this.minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssW, h: cssH };
  }

  _worldToMap(x, z, w, h) {
    const b = this.bounds;
    const spanX = Math.max(1, b.maxX - b.minX);
    const spanZ = Math.max(1, b.maxZ - b.minZ);
    const padX = 12;
    const padTop = 17;
    const padBot = 9;
    const availW = Math.max(24, w - padX * 2);
    const availH = Math.max(24, h - padTop - padBot);
    const scale = Math.min(availW / spanX, availH / spanZ);
    const ox = (w - spanX * scale) * 0.5;
    const oy = padTop + (availH - spanZ * scale) * 0.5;
    return [ox + (x - b.minX) * scale, oy + (z - b.minZ) * scale];
  }

  _drawMinimap(playerCar, allCars) {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const { w, h } = this._ensureHiDPIMinimap();
    if (w <= 0 || h <= 0) return;

    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Pit lane bypass trace & Pit Box marker
    ctx.beginPath();
    let startedPit = false;
    const pitOrder = [];
    for (const s of this.track.samples) if (s.s >= 905) pitOrder.push(s);
    for (const s of this.track.samples) if (s.s <= 122) pitOrder.push(s);
    for (let i = 0; i < pitOrder.length; i += 3) {
      const smp = pitOrder[i];
      if (smp.pitOffset === null) continue;
      const px = smp.pos.x + smp.right.x * smp.pitOffset * 1.55;
      const pz = smp.pos.z + smp.right.z * smp.pitOffset * 1.55;
      const [mx, my] = this._worldToMap(px, pz, w, h);
      if (!startedPit) {
        ctx.moveTo(mx, my);
        startedPit = true;
      } else {
        ctx.lineTo(mx, my);
      }
    }
    ctx.strokeStyle = 'rgba(0, 210, 190, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const pbFr = this.track.sampleAt(PIT_LANE_CONFIG.playerBoxS, PIT_LANE_CONFIG.lateralOffset * 1.55);
    const [pbx, pby] = this._worldToMap(pbFr.pos.x, pbFr.pos.z, w, h);
    ctx.fillStyle = '#00d2be';
    ctx.fillRect(pbx - 1.8, pby - 1.8, 3.6, 3.6);

    // 2. Clean Broadcast Vector Circuit Ribbon (Dark Asphalt Casing + Crisp Slate-White Line)
    ctx.beginPath();
    for (let i = 0; i < this.track.samples.length; i += 4) {
      const p = this.track.samples[i].pos;
      const [mx, my] = this._worldToMap(p.x, p.z, w, h);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();

    ctx.strokeStyle = 'rgba(4, 7, 14, 0.94)';
    ctx.lineWidth = 5.2;
    ctx.stroke();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 3. Highlight active Yellow-Flag / VSC Sectors
    const yellowSet = this.raceSystems.getActiveYellowSectorSet();
    if (this.raceSystems.vscActive || yellowSet.size > 0) {
      const pulseAlpha = 0.70 + 0.30 * Math.sin(performance.now() * 0.010);
      for (const sec of FUJI_SECTORS) {
        if (!this.raceSystems.vscActive && !yellowSet.has(sec.id)) continue;
        ctx.beginPath();
        let first = true;
        for (let sVal = sec.start; sVal <= sec.end; sVal += 3) {
          const fr = this.track.sampleAt(sVal, 0);
          const [mx, my] = this._worldToMap(fr.pos.x, fr.pos.z, w, h);
          if (first) {
            ctx.moveTo(mx, my);
            first = false;
          } else {
            ctx.lineTo(mx, my);
          }
        }
        ctx.strokeStyle = `rgba(245, 183, 0, ${pulseAlpha.toFixed(2)})`;
        ctx.lineWidth = 3.8;
        ctx.stroke();
      }
    }

    // 4. Perpendicular Start/Finish Line Tick
    const sf = this.track.sampleAt(0, 0);
    const sfL = this.track.sampleAt(0, -14);
    const sfR = this.track.sampleAt(0, 14);
    const [lx, ly] = this._worldToMap(sfL.pos.x, sfL.pos.z, w, h);
    const [rx, ry] = this._worldToMap(sfR.pos.x, sfR.pos.z, w, h);
    const [sfx, sfy] = this._worldToMap(sf.pos.x, sf.pos.z, w, h);
    const ndx = rx - lx;
    const ndy = ry - ly;
    const nLen = Math.hypot(ndx, ndy) || 1;
    const ux = (ndx / nLen) * 4.6;
    const uy = (ndy / nLen) * 4.6;
    ctx.beginPath();
    ctx.moveTo(sfx - ux, sfy - uy);
    ctx.lineTo(sfx + ux, sfy + uy);
    ctx.strokeStyle = '#e10600';
    ctx.lineWidth = 3.0;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 5. Rival Dots
    let leadRival = null;
    for (const c of allCars) {
      if (!c.isPlayer && (!leadRival || c.totalDistanceGameM > leadRival.totalDistanceGameM)) {
        leadRival = c;
      }
    }

    for (const c of allCars) {
      if (c.isPlayer || c.exploded) continue;
      const lat = c.inPitLane ? PIT_LANE_CONFIG.lateralOffset * 1.55 : c.lateralOffset;
      const fr = this.track.sampleAt(c.s, lat);
      const [cx, cy] = this._worldToMap(fr.pos.x, fr.pos.z, w, h);
      ctx.beginPath();
      ctx.arc(cx, cy, c === leadRival ? 3.2 : 2.7, 0, Math.PI * 2);
      ctx.fillStyle = c.liveryHex || '#94a3b8';
      ctx.fill();
      ctx.strokeStyle = c === leadRival ? '#f5b700' : '#060a12';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // 6. Crisp Directional Player Chevron
    const pLat = playerCar.inPitLane ? PIT_LANE_CONFIG.lateralOffset * 1.55 : playerCar.lateralOffset;
    const pFr = this.track.sampleAt(playerCar.s, pLat);
    const pAhead = this.track.sampleAt(playerCar.s + 3.5, pLat);
    const [px, py] = this._worldToMap(pFr.pos.x, pFr.pos.z, w, h);
    const [ax, ay] = this._worldToMap(pAhead.pos.x, pAhead.pos.z, w, h);
    const mapHeading = Math.atan2(ay - py, ax - px) + (playerCar.relYaw || 0) * 0.5;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(mapHeading);
    ctx.beginPath();
    ctx.moveTo(6.2, 0);
    ctx.lineTo(-4.4, 4.0);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-4.4, -4.0);
    ctx.closePath();
    ctx.fillStyle = '#00d2be';
    ctx.fill();
    ctx.strokeStyle = '#040810';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
}
