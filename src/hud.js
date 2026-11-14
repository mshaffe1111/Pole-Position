// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Dual-Mode Telemetry HUD, Live GPS Minimap, Pre-Pit Strategy & Podium Modal
// ============================================================================

import { TIRE_COMPOUNDS, FUJI_SECTORS } from './config.js';

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
    this.bannerTimeout = null;

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
    this.speedKmhEl = document.getElementById('hud-speed-kmh');
    this.speedMphEl = document.getElementById('hud-speed-mph');
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

    // Pre-Pit Strategy Drawer & Pit Stop Clutch Overlay
    this.pitToggleBtn = document.getElementById('btn-toggle-pit-strategy');
    this.pitDrawerEl = document.getElementById('pit-strategy-drawer');
    this.pitApproachHintEl = document.getElementById('pit-approach-hint');

    this.pitStopOverlayEl = document.getElementById('pit-stop-overlay');
    this.pitServiceStatusEl = document.getElementById('pit-service-status');
    this.pitServiceTimerEl = document.getElementById('pit-service-timer');
    this.clutchWrapEl = document.getElementById('clutch-minigame-wrap');
    this.clutchCursorEl = document.getElementById('clutch-cursor');
    this.clutchResultEl = document.getElementById('clutch-result-text');
    this.clutchReleaseBtn = document.getElementById('btn-clutch-release');

    // Minimap
    this.minimapCanvas = document.getElementById('gps-minimap');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
  }

  _bindStrategyButtons() {
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
      this.pitToggleBtn.innerHTML = `🔧 PIT PLAN: <b>${cShort}</b> • +${plan.fuelToAdd === 'FILL' ? 'FILL' : plan.fuelToAdd + 'L'}`;
    }
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
    if (this.pitToggleBtn) this.pitToggleBtn.style.display = is2026 ? 'inline-flex' : 'none';
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
    }

    if (this.lapTimeEl) this.lapTimeEl.textContent = formatLapTimeArcade(playerCar.currentLapTime);
    if (this.bestLapEl) {
      this.bestLapEl.textContent = playerCar.bestLapTime
        ? `BEST ${formatLapTimeArcade(playerCar.bestLapTime)}`
        : 'BEST --"--';
    }

    const kmh = Math.round(playerCar.speedKmh);
    const mph = Math.round(playerCar.speedKmh * 0.621371);
    if (this.speedKmhEl) this.speedKmhEl.textContent = String(kmh).padStart(3, '0');
    if (this.speedMphEl) this.speedMphEl.textContent = `${mph} MPH`;

    if (this.rpmFillEl) {
      const rpmPct = Math.max(5, Math.min(100, ((playerCar.rpm - 1800) / 10800) * 100));
      this.rpmFillEl.style.width = `${rpmPct}%`;
      this.rpmFillEl.style.background = playerCar.overRevTimer > 0
        ? '#ff1744'
        : (rpmPct > 86 ? '#ff3d00' : (rpmPct > 65 ? '#ffd600' : '#00e676'));
    }

    if (this.slipBadgeEl) {
      this.slipBadgeEl.style.display = playerCar.inSlipstream ? 'inline-block' : 'none';
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
    const comp = TIRE_COMPOUNDS[playerCar.compound] || TIRE_COMPOUNDS.SOFT;
    if (this.compoundBadgeEl) {
      this.compoundBadgeEl.textContent = `${comp.name}`;
      this.compoundBadgeEl.style.borderColor = comp.colorHex;
      this.compoundBadgeEl.style.color = comp.colorHex;
    }

    for (const k of ['FL', 'FR', 'RL', 'RR']) {
      const box = this.tireBoxes[k];
      if (!box) continue;
      const t = playerCar.tires[k];
      const pct = Math.round(t.life * 100);
      const col = tireWearColor(t.life, t.punctured);
      box.style.borderColor = col;
      box.innerHTML = `
        <span class="t-corner">${k}</span>
        <span class="t-pct" style="color:${col}">${t.punctured ? 'PUNC' : pct + '%'}</span>
        <span class="t-temp">${Math.round(t.temp)}°C</span>
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
      this.fuelFillEl.style.background = fuel < 1.5 ? '#ff1744' : '#00d4ff';
    }

    // Weather & Moisture W
    if (weatherSummary) {
      if (this.weatherCurEl) {
        this.weatherCurEl.textContent = `${weatherSummary.current.icon} ${weatherSummary.current.label}`;
      }
      if (this.weatherNextEl) {
        this.weatherNextEl.textContent = weatherSummary.current.id !== weatherSummary.next.id
          ? `→ ${weatherSummary.next.icon} (${weatherSummary.etaSec}s)`
          : '→ STABLE';
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
      const nearPitSplit = sessionPhase === 'RACING' && !playerCar.inPitLane && playerCar.s >= 785 && playerCar.s <= 918;
      this.pitApproachHintEl.style.display = nearPitSplit ? 'block' : 'none';
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
          if (cg.active && this.clutchCursorEl) {
            this.clutchCursorEl.style.left = `${(cg.cursor * 100).toFixed(1)}%`;
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
  // LIVE GPS MINIMAP RENDERER
  // --------------------------------------------------------------------------
  _prepareMinimapStaticPath() {
    this.bounds = this.track.computeMinimapBounds();
  }

  _worldToMap(x, z, w, h) {
    const b = this.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const scale = Math.min((w - 18) / spanX, (h - 18) / spanZ);
    const ox = (w - spanX * scale) * 0.5;
    const oy = (h - spanZ * scale) * 0.5;
    return [ox + (x - b.minX) * scale, oy + (z - b.minZ) * scale];
  }

  _drawMinimap(playerCar, allCars) {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Pit lane bypass trace
    ctx.beginPath();
    let startedPit = false;
    const pitOrder = [];
    for (const s of this.track.samples) if (s.s >= 905) pitOrder.push(s);
    for (const s of this.track.samples) if (s.s <= 122) pitOrder.push(s);
    for (let i = 0; i < pitOrder.length; i += 4) {
      const smp = pitOrder[i];
      if (smp.pitOffset === null) continue;
      const px = smp.pos.x + smp.right.x * smp.pitOffset * 2.2;
      const pz = smp.pos.z + smp.right.z * smp.pitOffset * 2.2;
      const [mx, my] = this._worldToMap(px, pz, w, h);
      if (!startedPit) {
        ctx.moveTo(mx, my);
        startedPit = true;
      } else {
        ctx.lineTo(mx, my);
      }
    }
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Main Fuji Speedway track outline
    ctx.beginPath();
    for (let i = 0; i < this.track.samples.length; i += 6) {
      const p = this.track.samples[i].pos;
      const [mx, my] = this._worldToMap(p.x, p.z, w, h);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 6.0;
    ctx.stroke();
    ctx.strokeStyle = '#90a4be';
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // Highlight active Yellow-Flag Sectors in bright yellow!
    const yellowSet = this.raceSystems.getActiveYellowSectorSet();
    if (this.raceSystems.vscActive || yellowSet.size > 0) {
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
        ctx.strokeStyle = '#ffea00';
        ctx.lineWidth = 4.5;
        ctx.stroke();
      }
    }

    // Start/Finish tick mark
    const sf = this.track.sampleAt(0, 0);
    const [sfx, sfy] = this._worldToMap(sf.pos.x, sf.pos.z, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sfx - 2, sfy - 5, 4, 10);

    // AI rival dots
    for (const c of allCars) {
      if (c.isPlayer) continue;
      const fr = this.track.sampleAt(c.s, c.lateralOffset);
      const [cx, cy] = this._worldToMap(fr.pos.x, fr.pos.z, w, h);
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = c.liveryHex || '#ff9800';
      ctx.fill();
    }

    // Player pulsing marker on top
    const pFr = this.track.sampleAt(playerCar.s, playerCar.lateralOffset);
    const [px, py] = this._worldToMap(pFr.pos.x, pFr.pos.z, w, h);
    ctx.beginPath();
    ctx.arc(px, py, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
    ctx.strokeStyle = '#061018';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}
