// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Interactive Pit Stop System, 4-Zone Damage & Yellow Flag / VSC Controller
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CAR_WIDTH,
  CAR_LENGTH,
  PIT_LANE_CONFIG,
  PIT_CREW_MODES,
  REPAIR_ORDERS,
} from './config.js';

function signedDeltaS(a, b) {
  let d = a - b;
  if (d > TRACK_GAME_LENGTH * 0.5) d -= TRACK_GAME_LENGTH;
  if (d < -TRACK_GAME_LENGTH * 0.5) d += TRACK_GAME_LENGTH;
  return d;
}

export class RaceSystemsController {
  constructor(track, effects) {
    this.track = track;
    this.effects = effects;

    // Player live pre-pit strategy selection
    this.playerPitPlan = {
      nextCompound: 'MEDIUM',
      fuelToAdd: 5,           // 2 | 5 | 10 | 'FILL'
      repairOrder: 'NONE',    // 'NONE' | 'WINGS' | 'FULL'
      crewPushMode: 'BALANCED', // 'SAFE' | 'BALANCED' | 'AGGRESSIVE_UNDERCUT'
    };

    // Live "BOX THIS LAP" radio confirmation & Career R&D Pit Crew modifiers
    this.boxThisLapRequested = false;
    this.pitModifiers = {
      pitStopDurationMult: 1.0,
      clutchZoneBonus: 0.0,
      pitErrorProbMult: 1.0,
    };

    // Interactive Clutch Release mini-game state during player pit stop
    this.clutchGame = {
      active: false,
      cursor: 0.0,
      dir: 1,
      resolved: false,
      resultText: '',
      bonusApplied: false,
      bonusSec: 0.0,
    };
    this.lastStickyGunTriggered = false;

    // Caution / Yellow Flag / VSC state
    this.yellowSectors = new Map(); // sectorId -> remainingSec
    this.vscActive = false;
    this.vscRemainingSec = 0;
    this.recentIncidentTimestamps = [];

    // Illegal pass under Yellow warning state
    this.yellowPassWarning = {
      active: false,
      rivalId: null,
      rivalName: '',
      timer: 0,
    };

    this._collisionCooldowns = new Map();
  }

  resetForNewSession(startingCompound = 'SOFT', totalLaps = 5, careerModifiers = null) {
    this.yellowSectors.clear();
    this.vscActive = false;
    this.vscRemainingSec = 0;
    this.recentIncidentTimestamps = [];
    this.yellowPassWarning.active = false;
    this._collisionCooldowns.clear();
    this.effects.clearAllDebris();
    this.boxThisLapRequested = false;

    this.pitModifiers = {
      pitStopDurationMult: Math.max(0.60, Math.min(1.15, careerModifiers?.pitStopDurationMult ?? 1.0)),
      clutchZoneBonus: Math.max(0.0, Math.min(0.24, careerModifiers?.clutchZoneBonus ?? 0.0)),
      pitErrorProbMult: Math.max(0.15, Math.min(1.25, careerModifiers?.pitErrorProbMult ?? 1.0)),
    };

    const isWetStart = startingCompound === 'INTERMEDIATE' || startingCompound === 'FULL_WET';
    if (isWetStart) {
      this.playerPitPlan.nextCompound = startingCompound;
    } else if (
      careerModifiers?.nextCompound &&
      careerModifiers.nextCompound !== 'INTERMEDIATE' &&
      careerModifiers.nextCompound !== 'FULL_WET'
    ) {
      this.playerPitPlan.nextCompound = careerModifiers.nextCompound;
    } else {
      this.playerPitPlan.nextCompound = startingCompound === 'SOFT' ? 'MEDIUM' : 'SOFT';
    }
    this.playerPitPlan.fuelToAdd = totalLaps >= 12 ? 10 : 5;
    this.playerPitPlan.repairOrder = 'NONE';
    this.playerPitPlan.crewPushMode = careerModifiers?.recommendedCrewPushMode || 'BALANCED';

    this.clutchGame.active = false;
    this.clutchGame.resolved = false;
    this.clutchGame.resultText = '';
    this.clutchGame.bonusApplied = false;
    this.clutchGame.bonusSec = 0.0;
    this.lastStickyGunTriggered = false;
  }

  toggleBoxThisLap() {
    this.boxThisLapRequested = !this.boxThisLapRequested;
    return this.boxThisLapRequested;
  }

  getClutchZoneBounds() {
    const halfBonus = (this.pitModifiers?.clutchZoneBonus || 0) * 0.5;
    return {
      sweetMin: Math.max(0.18, 0.38 - halfBonus),
      sweetMax: Math.min(0.84, 0.64 + halfBonus),
      goodMin: Math.max(0.10, 0.28 - halfBonus),
      goodMax: Math.min(0.92, 0.74 + halfBonus),
    };
  }

  getActiveYellowSectorSet() {
    return new Set(this.yellowSectors.keys());
  }

  isSectorYellow(sectorId) {
    return this.vscActive || this.yellowSectors.has(sectorId);
  }

  triggerIncidentCaution(s, lateralOffset, isMultiCar = false, callbacks = {}) {
    const sec = this.track.getSector(s);
    const now = performance.now() * 0.001;
    this.recentIncidentTimestamps.push(now);
    this.recentIncidentTimestamps = this.recentIncidentTimestamps.filter((t) => now - t < 9.0);

    this.effects.spawnCarbonDebris(s, lateralOffset, sec.id);
    this.yellowSectors.set(sec.id, 26.0);

    if ((isMultiCar || this.recentIncidentTimestamps.length >= 2) && !this.vscActive) {
      // Full-Course Yellow / Virtual Safety Car (~1 lap at 160 km/h delta)
      this.vscActive = true;
      this.vscRemainingSec = 58.0;
      if (callbacks.onVSCDeployed) {
        callbacks.onVSCDeployed(sec);
      }
    } else if (callbacks.onLocalYellow) {
      callbacks.onLocalYellow(sec);
    }
  }

  attemptClutchRelease(playerCar) {
    if (!this.clutchGame.active || this.clutchGame.resolved) return null;
    this.clutchGame.resolved = true;
    const c = this.clutchGame.cursor;
    const bounds = this.getClutchZoneBounds();

    // Green optimal sweet spot (widened by Career Pit Crew R&D!)
    if (c >= bounds.sweetMin && c <= bounds.sweetMax) {
      playerCar.pitStopTimer = Math.max(0.05, playerCar.pitStopTimer - 0.35);
      this.clutchGame.resultText = '⚡ PERFECT CLUTCH LAUNCH! -0.35s';
      this.clutchGame.bonusApplied = true;
      this.clutchGame.bonusSec = 0.35;
      return 'PERFECT';
    }
    // Amber good release zone
    if (c >= bounds.goodMin && c <= bounds.goodMax) {
      playerCar.pitStopTimer = Math.max(0.05, playerCar.pitStopTimer - 0.15);
      this.clutchGame.resultText = 'CLEAN CLUTCH RELEASE! -0.15s';
      this.clutchGame.bonusApplied = true;
      this.clutchGame.bonusSec = 0.15;
      return 'GOOD';
    }

    this.clutchGame.resultText = c < bounds.goodMin ? 'EARLY CLUTCH BOG!' : 'WHEELSPIN LAUNCH!';
    this.clutchGame.bonusApplied = false;
    this.clutchGame.bonusSec = 0.0;
    return 'MISS';
  }

  // --------------------------------------------------------------------------
  // PIT LANE CORRIDOR, SPEEDING PENALTY & CREW SERVICE EXECUTION
  // --------------------------------------------------------------------------
  updatePitLaneForCar(car, dt, ctx) {
    const { mode, totalLaps, callbacks = {} } = ctx;
    if (mode === '1982_ORIGINAL') return;

    const s = car.s;

    // 1. Check Pit Entry split at Sector 10 (s in [895..930])
    const entryStartS = (car.isPlayer && this.boxThisLapRequested) ? 895 : 906;
    if (!car.inPitLane && s >= entryStartS && s <= 930) {
      const entryLatThreshold = this.boxThisLapRequested
        ? ROAD_HALF_WIDTH * 0.16
        : ROAD_HALF_WIDTH * 0.46;
      const playerSteeredIn = car.isPlayer && car.lateralOffset >= entryLatThreshold;
      const aiPittingNow = !car.isPlayer && car.aiWantsToPit;
      if (playerSteeredIn || aiPittingNow) {
        car.inPitLane = true;
        car.pitPhase = 'ENTRY';
        car.pitSpeedingFlagged = false;
        if (car.isPlayer) {
          this.boxThisLapRequested = false;
          if (callbacks.onPlayerEnteredPitLane) {
            callbacks.onPlayerEnteredPitLane();
          }
        }
      }
    }

    if (!car.inPitLane) return;

    // 2. Check 80 km/h Speed Limit Line at s = 942
    if (
      car.pitPhase === 'ENTRY' &&
      s >= PIT_LANE_CONFIG.speedLimitLineS &&
      s <= PIT_LANE_CONFIG.speedLimitLineS + 14 &&
      !car.pitSpeedingFlagged
    ) {
      if (car.speedKmh > PIT_LANE_CONFIG.speedLimitKmh + 1.2) {
        car.pitSpeedingFlagged = true;
        if (car.isPlayer && callbacks.onPitSpeeding) {
          callbacks.onPitSpeeding(PIT_LANE_CONFIG.speedingPenaltySec);
        }
      }
    }

    // 3. Pull into assigned Pit Box
    const targetBoxS = car.isPlayer ? PIT_LANE_CONFIG.playerBoxS : (car.assignedPitBoxS ?? 30);
    const distToBoxGameM = signedDeltaS(targetBoxS, s);

    if (car.pitPhase === 'ENTRY' && distToBoxGameM <= 5.5 && distToBoxGameM >= -3.5) {
      // Auto-guide smoothly to standstill in pit box
      car.speedKmh = Math.max(0, car.speedKmh - 95.0 * dt);
      if (car.speedKmh <= 4.0 || distToBoxGameM <= 0.4) {
        car.s = targetBoxS;
        car.speedKmh = 0;
        car.pitPhase = 'STOPPED';
        this._beginStationaryPitService(car, totalLaps, callbacks);
      }
    }

    // 4. Stationary Pit Crew Service Countdown
    if (car.pitPhase === 'STOPPED') {
      car.pitStopTimer -= dt;
      const elapsed = car.pitStopTotalDuration - car.pitStopTimer;

      // Jack lift animation (lifts in first 0.35s, drops in final 0.35s)
      if (car.pitStopTimer > 0.4) {
        car.pitJackLift = Math.min(1, elapsed / 0.35);
      } else {
        car.pitJackLift = Math.max(0, car.pitStopTimer / 0.35);
      }

      // Trigger Player Optimal Clutch Release mini-timing bar in final 1.45s!
      if (car.isPlayer && car.pitStopTimer <= 1.45 && car.pitStopTimer > 0.06) {
        this.clutchGame.active = true;
        if (!this.clutchGame.resolved) {
          this.clutchGame.cursor += this.clutchGame.dir * dt * 1.52;
          if (this.clutchGame.cursor >= 1.0) {
            this.clutchGame.cursor = 1.0;
            this.clutchGame.dir = -1;
          } else if (this.clutchGame.cursor <= 0.0) {
            this.clutchGame.cursor = 0.0;
            this.clutchGame.dir = 1;
          }
        }
      }

      if (car.pitStopTimer <= 0) {
        this._completePitService(car, totalLaps, callbacks);
      }
    }

    // 5. Pit Exit Merge back onto Main Straight at s = 115
    if (car.pitPhase === 'EXIT') {
      if (s < PIT_LANE_CONFIG.mergeEndS || s > 900) {
        if (!car.isPlayer) {
          car.throttleInput = 1.0;
          car.brakeInput = 0.0;
        } else if (car.speedKmh < 75) {
          car.throttleInput = Math.max(car.throttleInput, 0.75);
        }
      } else if (s >= PIT_LANE_CONFIG.mergeEndS && s < 300) {
        car.inPitLane = false;
        car.pitPhase = 'NONE';
        car.pitJackLift = 0;
        if (car.isPlayer && callbacks.onPlayerExitedPitLane) {
          callbacks.onPlayerExitedPitLane();
        }
      }
    }
  }

  _beginStationaryPitService(car, totalLaps, callbacks) {
    let plan;
    if (car.isPlayer) {
      plan = { ...this.playerPitPlan };
    } else {
      plan = car.aiPitPlan || {
        nextCompound: 'MEDIUM',
        fuelToAdd: 8,
        repairOrder: (car.damage.frontWing > 0.35 || car.damage.rearWing > 0.35) ? 'WINGS' : 'NONE',
        crewPushMode: 'BALANCED',
      };
    }

    const pushCfg = PIT_CREW_MODES[plan.crewPushMode] || PIT_CREW_MODES.BALANCED;
    const repCfg = REPAIR_ORDERS[plan.repairOrder] || REPAIR_ORDERS.NONE;

    const durMult = car.isPlayer ? (this.pitModifiers?.pitStopDurationMult ?? 1.0) : 1.0;
    const errMult = car.isPlayer ? (this.pitModifiers?.pitErrorProbMult ?? 1.0) : 1.0;

    let duration = pushCfg.baseTireSec * durMult;
    let stickyError = false;
    if (Math.random() < pushCfg.errorProb * errMult) {
      stickyError = true;
      duration += pushCfg.errorDelaySec * Math.max(0.65, durMult);
    }

    const remainingLaps = Math.max(1, totalLaps - car.lap + 1.5);
    const fuelLapsAdd = plan.fuelToAdd === 'FILL'
      ? Math.max(0, remainingLaps - car.fuelLaps)
      : Number(plan.fuelToAdd || 0);

    // Parallel refueling hose adds minor overhead above tire change if heavy fuel requested
    duration += Math.max(0, fuelLapsAdd * 0.14 - 0.55);
    duration += repCfg.sec;

    if (car.pitSpeedingFlagged) {
      duration += PIT_LANE_CONFIG.speedingPenaltySec;
    }

    car._activeServicePlan = { ...plan, fuelLapsAdd, stickyError, totalDuration: duration };
    car.pitStopTotalDuration = duration;
    car.pitStopTimer = duration;

    if (car.isPlayer) {
      this.lastStickyGunTriggered = stickyError;
      this.clutchGame.active = false;
      this.clutchGame.cursor = 0.1;
      this.clutchGame.dir = 1;
      this.clutchGame.resolved = false;
      this.clutchGame.resultText = stickyError ? 'STICKY WHEEL GUN! +3.0s' : '';
      this.clutchGame.bonusApplied = false;
      this.clutchGame.bonusSec = 0.0;
      if (callbacks.onPlayerPitStopped) {
        callbacks.onPlayerPitStopped(car._activeServicePlan);
      }
    }
  }

  _completePitService(car, totalLaps, callbacks) {
    const plan = car._activeServicePlan || { nextCompound: 'MEDIUM', fuelLapsAdd: 5, repairOrder: 'NONE', totalDuration: 2.5 };

    // Swap all 4 tires
    car.compound = plan.nextCompound;
    const freshTemp = plan.nextCompound === 'FULL_WET' ? 58 : (plan.nextCompound === 'INTERMEDIATE' ? 68 : 88);
    for (const k of ['FL', 'FR', 'RL', 'RR']) {
      car.tires[k].life = 1.0;
      car.tires[k].temp = freshTemp;
      car.tires[k].punctured = false;
    }
    car.damage.hasPuncture = false;

    // Add fuel
    car.fuelLaps = Math.min(car.maxFuelLaps, car.fuelLaps + plan.fuelLapsAdd);

    // Apply repairs
    if (plan.repairOrder === 'WINGS') {
      car.damage.frontWing = 0.0;
      car.damage.rearWing = 0.0;
    } else if (plan.repairOrder === 'FULL') {
      car.damage.frontWing = 0.0;
      car.damage.rearWing = 0.0;
      car.damage.suspension = 0.0;
    }

    const savedSec = car.isPlayer && this.clutchGame.bonusApplied ? (this.clutchGame.bonusSec || 0.35) : 0.0;
    const actualSec = Number(Math.max(1.4, plan.totalDuration - savedSec).toFixed(2));
    car.pitStopsCompleted += 1;
    car.pitHistory.push({
      lap: car.lap,
      compound: car.compound,
      durationSec: actualSec,
      stickyError: !!plan.stickyError,
    });

    car.aiWantsToPit = false;
    car.pitJackLift = 0;
    car.pitPhase = 'EXIT';
    car.speedKmh = car.isPlayer && this.clutchGame.bonusApplied
      ? (savedSec >= 0.30 ? 58.0 : 48.0)
      : 38.0;

    if (car.isPlayer) {
      this.clutchGame.active = false;
      this.playerPitPlan.repairOrder = 'NONE';
      if (callbacks.onPlayerPitReleased) {
        callbacks.onPlayerPitReleased(car, actualSec);
      }
    }
    if (callbacks.onCompoundVisualChanged) {
      callbacks.onCompoundVisualChanged(car);
    }
  }

  // --------------------------------------------------------------------------
  // COLLISION SOLVER (CAR-VS-CAR, CAR-VS-BILLBOARD, CAR-VS-DEBRIS)
  // --------------------------------------------------------------------------
  updateCollisionsAndCautions(allCars, playerCar, dt, ctx) {
    const { mode, callbacks = {} } = ctx;
    const isClassic = mode === '1982_ORIGINAL';
    const mPerGameM = this.track.realMetersPerGameMeter || REAL_METERS_PER_GAME_METER;

    // Decay yellow sector timers & VSC timer
    for (const [secId, rem] of this.yellowSectors.entries()) {
      const next = rem - dt;
      if (next <= 0) this.yellowSectors.delete(secId);
      else this.yellowSectors.set(secId, next);
    }
    if (this.vscActive) {
      this.vscRemainingSec -= dt;
      if (this.vscRemainingSec <= 0) {
        this.vscActive = false;
        if (callbacks.onVSCEnded) callbacks.onVSCEnded();
      }
    }

    // Decay pair collision cooldowns
    for (const [k, cd] of this._collisionCooldowns.entries()) {
      if (cd - dt <= 0) this._collisionCooldowns.delete(k);
      else this._collisionCooldowns.set(k, cd - dt);
    }

    // 1. Roadside Billboard Collisions
    for (const car of allCars) {
      if (car.exploded || car.inPitLane) continue;
      if (Math.abs(car.lateralOffset) < ROAD_HALF_WIDTH + 1.8) continue;

      for (const bb of this.track.billboards) {
        const dsM = Math.abs(signedDeltaS(car.s, bb.s)) * mPerGameM;
        const dLat = Math.abs(car.lateralOffset - bb.lateralOffset);
        if (dsM < 2.2 && dLat < bb.halfWidth * 0.72) {
          if (isClassic || car.speedKmh > 220) {
            this._explodeCar(car, callbacks);
            if (!isClassic) this.triggerIncidentCaution(car.s, car.lateralOffset, false, callbacks);
          } else {
            const key = `${car.id}_BB_${bb.s}`;
            if (!this._collisionCooldowns.has(key)) {
              this._collisionCooldowns.set(key, 1.2);
              car.damage.frontWing = Math.min(1.0, car.damage.frontWing + 0.55);
              car.speedKmh *= 0.45;
              car.lateralOffset = Math.sign(car.lateralOffset) * (ROAD_HALF_WIDTH + 0.5);
              this.triggerIncidentCaution(car.s, car.lateralOffset, false, callbacks);
              if (callbacks.onCollision) callbacks.onCollision(car, 95, 'FRONT_WING');
            }
          }
          break;
        }
      }
    }

    // 2. Physical Carbon Fiber Debris Puncture Hazard (2026 Mode)
    if (!isClassic) {
      for (const car of allCars) {
        if (car.exploded || car.inPitLane || car.damage.hasPuncture) continue;
        for (const deb of this.effects.debrisItems) {
          const dsM = Math.abs(signedDeltaS(car.s, deb.s)) * mPerGameM;
          const dLat = Math.abs(car.lateralOffset - deb.lateralOffset);
          if (dsM < deb.radius && dLat < deb.radius && car.speedKmh > 85) {
            const key = `${car.id}_DEB_${Math.round(deb.s)}`;
            if (!this._collisionCooldowns.has(key)) {
              this._collisionCooldowns.set(key, 4.0);
              if (Math.random() < (car.isPlayer ? 0.55 : 0.25)) {
                const corner = car.lateralOffset < deb.lateralOffset ? 'FR' : 'FL';
                car.tires[corner].punctured = true;
                car.damage.hasPuncture = true;
                if (callbacks.onPuncture) callbacks.onPuncture(car, corner);
              }
            }
          }
        }
      }
    }

    // 3. Car-vs-Car Collisions & Slipstream Tow Calculation
    for (const car of allCars) {
      car.inSlipstream = false;
      car.slipstreamFactor = 0;
    }

    for (let i = 0; i < allCars.length; i++) {
      const a = allCars[i];
      if (a.exploded || a.inPitLane) continue;

      for (let j = i + 1; j < allCars.length; j++) {
        const b = allCars[j];
        if (b.exploded || b.inPitLane) continue;

        const dsGame = signedDeltaS(b.s, a.s); // > 0 means b is ahead of a
        const dsReal = dsGame * mPerGameM;
        const absLongM = Math.abs(dsReal);
        const dLat = b.lateralOffset - a.lateralOffset;
        const absLatM = Math.abs(dLat);

        // Slipstream Draft Wake (trailing car 5.2m..43.0m behind within +-2.25m lateral)
        if (absLongM > 5.2 && absLongM < 43.0 && absLatM < 2.25) {
          const trailer = dsReal > 0 ? a : b;
          const leader = dsReal > 0 ? b : a;
          if (leader.speedKmh > 130) {
            const tow = (1.0 - (absLongM - 5.2) / 37.8) * (1.0 - absLatM / 2.25);
            if (tow > trailer.slipstreamFactor) {
              trailer.slipstreamFactor = tow;
              trailer.inSlipstream = tow > 0.16;
            }
          }
        }

        // Physical Bounding Box Overlap Check
        if (absLongM < CAR_LENGTH * 0.88 && absLatM < CAR_WIDTH * 0.92) {
          const pairKey = `${a.id}_${b.id}`;
          if (this._collisionCooldowns.has(pairKey)) continue;
          this._collisionCooldowns.set(pairKey, 0.65);

          if (isClassic) {
            // 1982 Original: touching a rival car triggers fiery explosion for player!
            if (a.isPlayer) this._explodeCar(a, callbacks);
            else if (b.isPlayer) this._explodeCar(b, callbacks);
            else {
              a.lateralOffset -= Math.sign(dLat || 1) * 0.8;
              b.lateralOffset += Math.sign(dLat || 1) * 0.8;
            }
          } else {
            this._resolve2026CarCollision(a, b, dsReal, dLat, callbacks);
          }
        }
      }
    }

    // 4. Local Yellow / VSC No-Overtaking Rule Enforcement for Player
    if (!isClassic && !playerCar.exploded && !playerCar.inPitLane) {
      this._updateYellowFlagOvertakeRule(playerCar, allCars, dt, callbacks);
    }
  }

  _explodeCar(car, callbacks) {
    if (car.exploded) return;
    car.exploded = true;
    car.explodeTimer = 2.1;
    car.speedKmh = 0;
    const fr = this.track.sampleAt(car.s, car.lateralOffset);
    this.effects.spawnExplosion(fr.pos);
    if (callbacks.onExplosion) callbacks.onExplosion(car);
  }

  _resolve2026CarCollision(a, b, dsReal, dLat, callbacks) {
    const trailer = dsReal >= 0 ? a : b;
    const leader = dsReal >= 0 ? b : a;
    const closingKmh = Math.max(
      12,
      Math.abs(trailer.speedKmh - leader.speedKmh) + Math.abs(a.lateralVel - b.lateralVel) * 2.2
    );

    if (closingKmh > 220) {
      this._explodeCar(trailer, callbacks);
      this.triggerIncidentCaution(trailer.s, trailer.lateralOffset, true, callbacks);
      return;
    }

    const isRearEnd = Math.abs(dsReal) > CAR_LENGTH * 0.45 && Math.abs(dLat) < CAR_WIDTH * 0.72;
    const severity = Math.min(0.85, closingKmh / 145.0);

    if (isRearEnd) {
      trailer.damage.frontWing = Math.min(1.0, trailer.damage.frontWing + severity * 0.65);
      leader.damage.rearWing = Math.min(1.0, leader.damage.rearWing + severity * 0.50);

      const midSpd = (trailer.speedKmh + leader.speedKmh) * 0.5;
      trailer.speedKmh = Math.max(40, midSpd - 16);
      leader.speedKmh = Math.min(315, midSpd + 10);

      if (callbacks.onCollision) {
        callbacks.onCollision(trailer, closingKmh, 'FRONT_WING');
        callbacks.onCollision(leader, closingKmh, 'REAR_WING');
      }
    } else {
      const pushDir = dLat >= 0 ? 1 : -1;
      a.lateralOffset -= pushDir * 0.85;
      b.lateralOffset += pushDir * 0.85;
      a.lateralVel = -pushDir * 5.0;
      b.lateralVel = pushDir * 5.0;

      if (severity > 0.22) {
        a.damage.suspension = Math.min(1.0, a.damage.suspension + severity * 0.55);
        a.damage.suspensionBias = -pushDir;
        a.damage.damagedCorner = pushDir > 0 ? 'FR' : 'FL';

        b.damage.suspension = Math.min(1.0, b.damage.suspension + severity * 0.55);
        b.damage.suspensionBias = pushDir;
        b.damage.damagedCorner = pushDir > 0 ? 'FL' : 'FR';
      }
      if (callbacks.onCollision) {
        callbacks.onCollision(a, closingKmh, 'SUSPENSION');
      }
    }

    if (closingKmh > 48 || trailer.damage.frontWing > 0.45) {
      this.triggerIncidentCaution(trailer.s, trailer.lateralOffset, closingKmh > 110, callbacks);
    }
  }

  _updateYellowFlagOvertakeRule(playerCar, allCars, dt, callbacks) {
    const playerSec = this.track.getSector(playerCar.s);
    const inYellowNow = this.isSectorYellow(playerSec.id);

    if (this.yellowPassWarning.active) {
      const rival = allCars.find((c) => c.id === this.yellowPassWarning.rivalId);
      // Clear warning immediately if player ceded the position back or rival pitted/crashed
      if (!rival || rival.inPitLane || rival.exploded || rival.totalDistanceGameM >= playerCar.totalDistanceGameM) {
        this.yellowPassWarning.active = false;
        if (callbacks.onYellowPassCleared) callbacks.onYellowPassCleared();
        return;
      }

      this.yellowPassWarning.timer -= dt;
      if (this.yellowPassWarning.timer <= 0) {
        this.yellowPassWarning.active = false;
        playerCar.timePenaltiesSec += 5.0;
        if (callbacks.onYellowPenaltyIssued) {
          callbacks.onYellowPenaltyIssued(5.0, this.yellowPassWarning.rivalName);
        }
      }
      return;
    }

    if (inYellowNow) {
      for (const rival of allCars) {
        if (
          rival.isPlayer ||
          rival.inPitLane ||
          rival.exploded ||
          rival.speedKmh < 75 ||
          Math.abs(rival.lateralOffset) > ROAD_HALF_WIDTH + 0.8
        ) {
          continue;
        }
        const prevAhead = rival._wasAheadOfPlayer;
        const nowAhead = rival.totalDistanceGameM > playerCar.totalDistanceGameM;
        if (prevAhead && !nowAhead && Math.abs(rival.totalDistanceGameM - playerCar.totalDistanceGameM) < 12) {
          this.yellowPassWarning.active = true;
          this.yellowPassWarning.rivalId = rival.id;
          this.yellowPassWarning.rivalName = rival.name;
          this.yellowPassWarning.timer = 3.0;
          if (callbacks.onYellowIllegalPassWarning) {
            callbacks.onYellowIllegalPassWarning(rival.name);
          }
          break;
        }
      }
    }

    for (const rival of allCars) {
      if (!rival.isPlayer) {
        rival._wasAheadOfPlayer = rival.totalDistanceGameM > playerCar.totalDistanceGameM;
      }
    }
  }
}
