// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Dual-Mode Broadcast Telemetry HUD, Anti-Aliased GPS Minimap & Pit Strategy
// ============================================================================

import { TIRE_COMPOUNDS, FUJI_SECTORS, PIT_LANE_CONFIG } from './config.js';

export function formatLapTimeArcade(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--"--';
  const s = Math.max(0, sec);
  const whole = Math.floor(s);
  const centi = Math.floor((s - whole) * 100);
  return `${String(whole).padStart(2, '0')}"${String(centi).padStart(2, '0')}`;
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
  if (punctured || life <= 0.05) return '#ff1744';
  if (life < 0.25) return '#ff3d00'; // Tire Cliff!
  if (life < 0.50) return '#ff9100';
  if (life < 0.75) return '#ffd600';
  return '#00e676';
}

function damageColor(val) {
  if (val > 0.65) return '#ff1744';
  if (val > 0.28) return '#ffab00';
  if (val > 0.05) return '#ffee58';
  return '#00e676';
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

    this._cacheElements();
    this._bindStrategyButtons();
    this._prepareMinimapStaticPath();
  }

  _cacheElements() {
    this.hudRoot = document.getElementById('race-hud');
    this.scoreEl = document.getElementById('hud-score');
    this.topScoreEl = document.getElementById('hud-top-score');
    this.timerEl = document.getElementById('hud-timer');
    this.timerLabelEl = document.getElementById('hud-timer-label');
    this.lapEl = document.getElementById('hud-lap');
    this.posEl = document.getElementById('hud-position');
    this.lapTimeEl = document.getElementById('hud-lap-time');
    this.bestLapEl = document.getElementById('hud-best-lap');
    this.sectorReadoutEl = document.getElementById('hud-sector-readout');
    this.speedUnitLabelEl = document.querySelector('.speed-col .stat-lbl');
    this.speedKmhEl = document.getElementById('hud-speed-kmh');
    this.speedMphEl = document.getElementById('hud-speed-mph');
    this.gearBoxEl = document.getElementById('hud-gear-box');
    this.gearValEl = document.getElementById('hud-gear-val');
    this.gearModeEl = document.getElementById('hud-gear-mode');
    this.rpmFillEl = document.getElementById('hud-rpm-fill');
    this.slipBadgeEl = document.getElementById('hud-slipstream-badge');

    // 2026 Telemetry Panel
    this.telemetryPanelEl = document.getElementById('telemetry-2026-panel');
    this.compoundBadgeEl = document.getElementById('tel-compound-badge');
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

    // Damage Silhouette Parts
    this.dmgFwEl = document.getElementById('dmg-part-fw');
    this.dmgRwEl = document.getElementById('dmg-part-rw');
    this.dmgSuspEl = document.getElementById('dmg-part-susp');
    this.dmgPuncEl = document.getElementById('dmg-part-punc');

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
      this.pitToggleBtn.innerHTML = `🔧 <b>${cShort}</b> +${plan.fuelToAdd === 'FILL' ? 'FL' : plan.fuelToAdd + 'L'}`;
    }
    this.syncBoxButtonState();
  }

  syncBoxButtonState() {
    if (!this.boxRequestBtn) return;
    const armed = !!this.raceSystems.boxThisLapRequested;
    this.boxRequestBtn.classList.toggle('armed', armed);
    this.boxRequestBtn.textContent = armed ? '📻 BOX✓' : '📻 BOX';
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
    this.radioToastEl.innerHTML = `<span class="radio-tag">📻 ENGINEER</span> ${message}`;
    this.radioToastEl.classList.add('visible');
    clearTimeout(this._radioTimer);
    this._radioTimer = setTimeout(() => {
      this.radioToastEl.classList.remove('visible');
    }, 4200);
  }

  setModeVisibility(mode) {
    const is2026 = mode === '2026_UPDATED';
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
    } = state;

    if (this.scoreEl) this.scoreEl.textContent = String(Math.floor(score)).padStart(6, '0');
    if (this.topScoreEl) this.topScoreEl.textContent = String(Math.floor(topScore)).padStart(6, '0');

    if (this.timerLabelEl) this.timerLabelEl.textContent = timerLabel;
    if (this.timerEl) {
      const tVal = Math.max(0, timerDisplaySec);
      this.timerEl.textContent = gameMode === '1982_ORIGINAL'
        ? Math.ceil(tVal).toString().padStart(2, '0')
        : formatLapTimeArcade(tVal);
      this.timerEl.classList.toggle('low-time', gameMode === '1982_ORIGINAL' && tVal <= 12);
    }

    if (this.lapEl) {
      this.lapEl.textContent = sessionPhase === 'QUALIFYING'
        ? 'QUALI 1/1'
        : `LAP ${Math.min(currentLap, totalLaps)}/${totalLaps}`;
    }

    if (this.posEl) {
      this.posEl.innerHTML = `${ordinalSuffix(playerPos)}<small>/${totalCars}</small>`;
      this.posEl.style.color = playerPos === 1 ? '#ffd600' : (playerPos <= 3 ? '#00e676' : '#f4f8ff');
    }

    if (this.lapTimeEl) this.lapTimeEl.textContent = formatLapTimeArcade(playerCar.currentLapTime);
    if (this.bestLapEl) {
      this.bestLapEl.textContent = playerCar.bestLapTime
        ? `BEST ${formatLapTimeArcade(playerCar.bestLapTime)}`
        : 'BEST --"--';
    }

    if (this.sectorReadoutEl) {
      const sec = this.track.getSector(playerCar.s);
      this.sectorReadoutEl.textContent = playerCar.inPitLane ? 'PIT LANE' : `SEC ${sec.id}`;
    }

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
        this.rpmFillEl.style.background = '#ff1744';
      } else if (rpmPct > 86) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #00e676 0%, #ffd600 50%, #ff1e38 78%, #00e5ff 100%)';
      } else if (rpmPct > 68) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #00e676 0%, #ffd600 62%, #ff1e38 100%)';
      } else if (rpmPct > 48) {
        this.rpmFillEl.style.background = 'linear-gradient(90deg, #00e676 0%, #ffd600 100%)';
      } else {
        this.rpmFillEl.style.background = '#00e676';
      }
      this.rpmFillEl.classList.toggle('shift-flash', rpmPct > 91 || playerCar.overRevTimer > 0);
    }

    if (this.slipBadgeEl) {
      this.slipBadgeEl.style.display = playerCar.inSlipstream ? 'inline-block' : 'none';
      if (playerCar.inSlipstream) {
        const towKmh = Math.max(5, Math.round((playerCar.slipstreamFactor || 0.5) * 15));
        this.slipBadgeEl.textContent = `⚡ DRS +${towKmh}`;
      }
    }

    // Caution / Yellow Flag / Illegal Pass Banner
    this._updateCautionBanner(playerCar);

    // 2026 Pro Telemetry Widget & Pit Overlays
    if (gameMode === '2026_UPDATED') {
      this._update2026Telemetry(playerCar, weatherSummary, sessionPhase);
    } else if (this.pitStopOverlayEl) {
      this.pitStopOverlayEl.style.display = 'none';
    }

    // Live GPS Minimap
    this._drawMinimap(playerCar, allCars);
  }

  _updateCautionBanner(playerCar) {
    if (!this.cautionBannerEl) return;

    const warn = this.raceSystems.yellowPassWarning;
    if (warn.active) {
      this.cautionBannerEl.style.display = 'block';
      this.cautionBannerEl.className = 'caution-banner penalty-warn';
      this.cautionBannerEl.textContent = `⚠️ ILLEGAL PASS UNDER YELLOW! YIELD TO ${warn.rivalName} IN ${warn.timer.toFixed(1)}s OR +5s PENALTY`;
      return;
    }

    if (this.raceSystems.vscActive) {
      this.cautionBannerEl.style.display = 'block';
      this.cautionBannerEl.className = 'caution-banner vsc';
      this.cautionBannerEl.textContent = `🟨 VIRTUAL SAFETY CAR (160 KM/H DELTA) • CHEAP PIT WINDOW OPEN (${Math.ceil(this.raceSystems.vscRemainingSec)}s)`;
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
        ? `🟨 LOCAL YELLOW IN THIS SECTOR (S${playerSec.id}) — NO OVERTAKING! DEBRIS AHEAD!`
        : `🟨 YELLOW FLAG IN ${secList} — CAUTION`;
      return;
    }

    this.cautionBannerEl.style.display = 'none';
  }

  _update2026Telemetry(playerCar, weatherSummary, sessionPhase) {
    this.syncBoxButtonState();

    const comp = TIRE_COMPOUNDS[playerCar.compound] || TIRE_COMPOUNDS.SOFT;
    if (this.compoundBadgeEl) {
      this.compoundBadgeEl.textContent = comp.name;
      this.compoundBadgeEl.style.borderColor = comp.colorHex;
      this.compoundBadgeEl.style.color = comp.colorHex;
    }

    for (const k of ['FL', 'FR', 'RL', 'RR']) {
      const box = this.tireBoxes[k];
      if (!box) continue;
      const t = playerCar.tires[k];
      const pct = Math.max(0, Math.round(t.life * 100));
      const col = tireWearColor(t.life, t.punctured);
      box.style.borderColor = col;
      box.innerHTML = `
        <span class="t-corner">${k}</span>
        <span class="t-pct" style="color:${col}">${t.punctured ? 'PUNC' : pct + '%'}</span>
        <span class="t-temp">${Math.round(t.temp)}°</span>
        <span class="t-wear-bar" style="width:${t.punctured ? 100 : pct}%;background:${col}"></span>
      `;
    }

    // Fuel
    const fuel = playerCar.fuelLaps;
    if (this.fuelValEl) {
      this.fuelValEl.textContent = `${fuel.toFixed(1)} LAPS`;
      this.fuelValEl.style.color = fuel < 1.5 ? '#ff1744' : '#e2ecf8';
    }
    if (this.fuelFillEl) {
      const fpct = Math.max(0, Math.min(100, (fuel / playerCar.maxFuelLaps) * 100));
      this.fuelFillEl.style.width = `${fpct}%`;
      this.fuelFillEl.style.background = fuel < 1.5
        ? '#ff1744'
        : 'linear-gradient(90deg, #00b0ff, #00e5ff)';
    }

    // Weather & Moisture W
    if (weatherSummary) {
      if (this.weatherCurEl) {
        this.weatherCurEl.textContent = `${weatherSummary.current.icon} ${weatherSummary.current.label}`;
      }
      if (this.weatherNextEl) {
        this.weatherNextEl.textContent = 'LOCKED';
      }
      if (this.moistureValEl) {
        const gPct = Math.round(weatherSummary.grooveMoisture * 100);
        const oPct = Math.round(weatherSummary.offLineMoisture * 100);
        this.moistureValEl.textContent = `W: ${gPct}% LINE / ${oPct}% OFF`;
      }
    }

    // 4-Zone Damage Silhouette
    const d = playerCar.damage;
    if (this.dmgFwEl) this.dmgFwEl.style.background = damageColor(d.frontWing);
    if (this.dmgRwEl) this.dmgRwEl.style.background = damageColor(d.rearWing);
    if (this.dmgSuspEl) this.dmgSuspEl.style.background = damageColor(d.suspension);
    if (this.dmgPuncEl) this.dmgPuncEl.style.background = d.hasPuncture ? '#ff1744' : '#00e676';

    // Sector 9/10 Pit Entry Approach Hint
    if (this.pitApproachHintEl) {
      const armed = !!this.raceSystems.boxThisLapRequested;
      const nearPitSplit = sessionPhase === 'RACING' && !playerCar.inPitLane && (
        (playerCar.s >= 785 && playerCar.s <= 922) || (armed && playerCar.s >= 720 && playerCar.s <= 926)
      );
      this.pitApproachHintEl.style.display = nearPitSplit ? 'block' : 'none';
      if (nearPitSplit) {
        this.pitApproachHintEl.textContent = armed
          ? '📻 BOX THIS LAP ARMED: KEEP RIGHT INTO PIT LANE!'
          : 'PIT ENTRY AHEAD: STEER RIGHT FOR SERVICE';
      }
    }

    // Active Pit Stop Crew & Optimal Clutch Release Overlay
    if (this.pitStopOverlayEl) {
      const showPitUI = playerCar.inPitLane;
      this.pitStopOverlayEl.style.display = showPitUI ? 'flex' : 'none';
      if (showPitUI) {
        if (playerCar.pitPhase === 'ENTRY') {
          this.pitServiceStatusEl.textContent = playerCar.pitSpeedingFlagged
            ? '⚠️ PIT SPEEDING (+5.0s PENALTY) • PULL INTO GREEN BOX'
            : 'PIT LANE LIMITER 80 KM/H • PULL INTO YOUR GREEN BOX';
          this.pitServiceTimerEl.textContent = `${Math.round(playerCar.speedKmh)} KM/H`;
          this.clutchWrapEl.style.display = 'none';
        } else if (playerCar.pitPhase === 'STOPPED') {
          const sticky = this.raceSystems.lastStickyGunTriggered ? ' • ⚠️ STICKY GUN +3.0s!' : '';
          this.pitServiceStatusEl.textContent = `CREW SERVICING (${this.raceSystems.playerPitPlan.nextCompound})${sticky}`;
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
            this.clutchResultEl.textContent = cg.resultText || 'HIT GREEN ZONE AS JACKS DROP (-0.35s)!';
          }
        } else if (playerCar.pitPhase === 'EXIT') {
          this.pitServiceStatusEl.textContent = this.raceSystems.clutchGame.resultText || 'GO GO GO! MERGE AT SECTOR 1';
          this.pitServiceTimerEl.textContent = 'EXITING PITS';
          this.clutchWrapEl.style.display = 'none';
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // ANTI-ALIASED HIGH-CONTRAST LIVE GPS MINIMAP RENDERER
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
    const padX = 13;
    const padTop = 18;
    const padBot = 10;
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

    // 1. Subtle tactical radar grid lines
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let gx = 20; gx < w; gx += 24) {
      ctx.beginPath();
      ctx.moveTo(gx, 14);
      ctx.lineTo(gx, h - 4);
      ctx.stroke();
    }
    for (let gy = 22; gy < h; gy += 22) {
      ctx.beginPath();
      ctx.moveTo(4, gy);
      ctx.lineTo(w - 4, gy);
      ctx.stroke();
    }

    // 2. Pit lane bypass trace & Pit Box marker
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
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.88)';
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Player Pit Box dot along Pit Lane
    const pbFr = this.track.sampleAt(PIT_LANE_CONFIG.playerBoxS, PIT_LANE_CONFIG.lateralOffset * 1.55);
    const [pbx, pby] = this._worldToMap(pbFr.pos.x, pbFr.pos.z, w, h);
    ctx.fillStyle = '#00e676';
    ctx.fillRect(pbx - 2, pby - 2, 4, 4);

    // 3. Multi-pass Anti-Aliased Circuit Ribbon (Outer Glow + Dark Casing + Crisp White/Cyan Track)
    ctx.beginPath();
    for (let i = 0; i < this.track.samples.length; i += 4) {
      const p = this.track.samples[i].pos;
      const [mx, my] = this._worldToMap(p.x, p.z, w, h);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.22)';
    ctx.lineWidth = 7.6;
    ctx.stroke();

    ctx.strokeStyle = '#07101f';
    ctx.lineWidth = 5.4;
    ctx.stroke();

    ctx.strokeStyle = '#dcebff';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // 4. Highlight active Yellow-Flag / VSC Sectors in pulsing bright yellow
    const yellowSet = this.raceSystems.getActiveYellowSectorSet();
    if (this.raceSystems.vscActive || yellowSet.size > 0) {
      const pulseAlpha = 0.65 + 0.35 * Math.sin(performance.now() * 0.012);
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
        ctx.strokeStyle = `rgba(255, 234, 0, ${pulseAlpha.toFixed(2)})`;
        ctx.lineWidth = 4.2;
        ctx.stroke();
      }
    }

    // 5. Crisp Perpendicular Start/Finish Line Checkered Tick
    const sf = this.track.sampleAt(0, 0);
    const sfL = this.track.sampleAt(0, -14);
    const sfR = this.track.sampleAt(0, 14);
    const [lx, ly] = this._worldToMap(sfL.pos.x, sfL.pos.z, w, h);
    const [rx, ry] = this._worldToMap(sfR.pos.x, sfR.pos.z, w, h);
    const [sfx, sfy] = this._worldToMap(sf.pos.x, sf.pos.z, w, h);
    const ndx = rx - lx;
    const ndy = ry - ly;
    const nLen = Math.hypot(ndx, ndy) || 1;
    const ux = (ndx / nLen) * 5.0;
    const uy = (ndy / nLen) * 5.0;
    ctx.beginPath();
    ctx.moveTo(sfx - ux, sfy - uy);
    ctx.lineTo(sfx + ux, sfy + uy);
    ctx.strokeStyle = '#ff1e38';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 6. High-Contrast Rival Dots
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
      ctx.arc(cx, cy, c === leadRival ? 3.5 : 3.0, 0, Math.PI * 2);
      ctx.fillStyle = c.liveryHex || '#ff9800';
      ctx.fill();
      ctx.strokeStyle = c === leadRival ? '#ffd600' : '#040812';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 7. Directional & Pulsing Player Marker on Top
    const pLat = playerCar.inPitLane ? PIT_LANE_CONFIG.lateralOffset * 1.55 : playerCar.lateralOffset;
    const pFr = this.track.sampleAt(playerCar.s, pLat);
    const pAhead = this.track.sampleAt(playerCar.s + 3.5, pLat);
    const [px, py] = this._worldToMap(pFr.pos.x, pFr.pos.z, w, h);
    const [ax, ay] = this._worldToMap(pAhead.pos.x, pAhead.pos.z, w, h);
    const mapHeading = Math.atan2(ay - py, ax - px) + (playerCar.relYaw || 0) * 0.5;

    // Expanding radar pulse halo
    const pulsePhase = (performance.now() * 0.0014) % 1.0;
    const haloR = 5.2 + pulsePhase * 7.5;
    ctx.beginPath();
    ctx.arc(px, py, haloR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 255, 136, ${(0.68 * (1 - pulsePhase)).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Directional player chevron arrow
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(mapHeading);
    ctx.beginPath();
    ctx.moveTo(6.6, 0);
    ctx.lineTo(-4.6, 4.3);
    ctx.lineTo(-2.4, 0);
    ctx.lineTo(-4.6, -4.3);
    ctx.closePath();
    ctx.fillStyle = '#00ff88';
    ctx.fill();
    ctx.strokeStyle = '#041018';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
