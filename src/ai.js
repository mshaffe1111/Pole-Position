// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Autonomous Spatial AI Engine: 15-Ray Radar, Corner Rights & 5 Personalities
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CAR_WIDTH,
  AI_ARCHETYPES,
} from './config.js';
import { shiftGear } from './physics.js';

// 13 forward lane sample offsets + 2 lateral sidepod overlap sensors = 15-Ray Spatial Radar!
const FORWARD_RAY_LANES = [-6.0, -5.0, -4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0];

function forwardDistGameM(fromS, toS) {
  let d = toS - fromS;
  if (d < 0) d += TRACK_GAME_LENGTH;
  return d;
}

function signedDeltaGameM(a, b) {
  let d = a - b;
  if (d > TRACK_GAME_LENGTH * 0.5) d -= TRACK_GAME_LENGTH;
  if (d < -TRACK_GAME_LENGTH * 0.5) d += TRACK_GAME_LENGTH;
  return d;
}

export class SpatialAIController {
  constructor(track, weather, raceSystems) {
    this.track = track;
    this.weather = weather;
    this.raceSystems = raceSystems;
  }

  initAICar(car, driverDef, index) {
    const arch = AI_ARCHETYPES[driverDef.archetype] || AI_ARCHETYPES.APEX_TACTICIAN;
    car.archetypeId = driverDef.archetype;
    car.archetype = arch;
    car.assignedPitBoxS = [976, 988, 2, 30, 42, 52, 60][index % 7];
    car.aiTargetLat = car.lateralOffset;
    car.aiDecisionTimer = (index * 0.019) % 0.08;
    car.aiLapBrakeJitter = 0;
    car.aiPressureTimer = 0;
    car.aiWantsToPit = false;
    car.aiPitPlan = null;
  }

  updateAI(car, allCars, playerCar, dt, ctx) {
    const { mode, isQualifying, totalLaps, callbacks = {} } = ctx;
    if (car.exploded || car.pitPhase === 'STOPPED') return;

    const isClassic = mode === '1982_ORIGINAL';
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;

    // Update lap-random braking jitter for ROOKIE_WILDCARD / LATE_BRAKER
    car.aiDecisionTimer -= dt;
    if (car.aiDecisionTimer <= 0) {
      car.aiDecisionTimer = 0.05; // 20Hz spatial radar planning, 240Hz smooth control execution
      this._run15RaySpatialPlanner(car, allCars, playerCar, isClassic, isQualifying, totalLaps, callbacks);
    }

    // Smooth steering controller toward chosen target lane (or Pit Entry split at Sector 10)
    let desiredLat = car.aiTargetLat;
    if (!isClassic && car.aiWantsToPit && !car.inPitLane && car.s >= 875 && car.s <= 930) {
      desiredLat = ROAD_HALF_WIDTH * 0.72; // Peel off cleanly into right-hand Pit Entry at 910m!
    }

    const latErr = desiredLat - car.lateralOffset;
    const rawSteer = Math.max(-1.0, Math.min(1.0, latErr * 0.34 - car.lateralVel * 0.055));
    car.steerInput += (rawSteer - car.steerInput) * Math.min(1, dt * 16.0);

    // Speed / Braking controller with upcoming corner lookahead & archetype braking points
    const targetSpeedKmh = car._aiTargetSpeedKmh ?? 295;
    const speedDiff = targetSpeedKmh - car.speedKmh;

    if (speedDiff > 3.0) {
      const smoothRamp = arch.id === 'TIRE_WHISPERER' ? 0.88 : 1.0;
      car.throttleInput = Math.min(1.0, (0.35 + speedDiff * 0.04) * smoothRamp);
      car.brakeInput = 0.0;
    } else if (speedDiff < -4.5) {
      car.throttleInput = 0.0;
      car.brakeInput = Math.min(1.0, Math.abs(speedDiff) / 52.0);
    } else {
      car.throttleInput = 0.42;
      car.brakeInput = 0.0;
    }

    // Automatic AI Gearbox Shifting (supports both 2-speed & 6-speed)
    if (car.gearboxMode === 'PRO_6SPD' && !isClassic) {
      const upshiftPts = [112, 158, 200, 238, 272];
      const downshiftPts = [92, 134, 174, 212, 246];
      if (car.gear < 6 && car.speedKmh > upshiftPts[car.gear - 1]) {
        shiftGear(car, +1);
      } else if (car.gear > 1 && car.speedKmh < downshiftPts[car.gear - 2]) {
        shiftGear(car, -1);
      }
    } else {
      if (car.gear === 1 && car.speedKmh > 169.0) {
        shiftGear(car, +1);
      } else if (car.gear === 2 && car.speedKmh < 142.0) {
        shiftGear(car, -1);
      }
    }

    // Rookie Wildcard under heavy player pressure can clip wet curbs / trigger incident!
    if (!isClassic && arch.id === 'ROOKIE_WILDCARD' && !car.inPitLane) {
      const distFromPlayerM = Math.abs(signedDeltaGameM(car.s, playerCar.s)) * REAL_METERS_PER_GAME_METER;
      if (distFromPlayerM < 22.0 && !playerCar.exploded) {
        car.aiPressureTimer += dt;
        if (car.aiPressureTimer > 7.5 && Math.abs(this.track.getPhysicsCurvature(car.s)) > 0.35) {
          car.aiPressureTimer = -12.0; // Cooldown after mistake
          if (Math.random() < 0.35) {
            car.lateralVel += (Math.random() < 0.5 ? -1 : 1) * 9.5;
            car.speedKmh *= 0.72;
            this.raceSystems.triggerIncidentCaution(car.s, car.lateralOffset, false, callbacks);
          }
        }
      } else {
        car.aiPressureTimer = Math.max(0, car.aiPressureTimer - dt * 0.5);
      }
    }
  }

  _run15RaySpatialPlanner(car, allCars, playerCar, isClassic, isQualifying, totalLaps, callbacks) {
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const s = car.s;
    const curSec = this.track.getSector(s);
    const curK = this.track.getPhysicsCurvature(s);
    const lookK45 = this.track.getPhysicsCurvature(s + 12); // ~52m ahead
    const lookK95 = this.track.getPhysicsCurvature(s + 24); // ~105m ahead

    // ------------------------------------------------------------------------
    // 1. AI PIT STRATEGY MONITOR (2026 MODE)
    // ------------------------------------------------------------------------
    if (!isClassic && !isQualifying && !car.inPitLane && car.lap < totalLaps) {
      this._evaluateAIPitStrategy(car, arch, totalLaps);
    }

    // ------------------------------------------------------------------------
    // 2. SIDEPOD RAYS #14 & #15: SIDE-BY-SIDE CORNER RIGHTS (1.25x CAR WIDTH)
    // ------------------------------------------------------------------------
    const minCorridor = CAR_WIDTH * 1.25; // 2.45m lateral respect corridor!
    let blockedLeftMax = -ROAD_HALF_WIDTH + 1.1;
    let blockedRightMin = ROAD_HALF_WIDTH - 1.1;

    for (const other of allCars) {
      if (other === car || other.exploded || other.inPitLane) continue;
      const dsReal = Math.abs(signedDeltaGameM(other.s, s)) * REAL_METERS_PER_GAME_METER;
      if (dsReal < 5.6) {
        if (other.lateralOffset < car.lateralOffset) {
          // Other car has overlap on our LEFT -> do not squeeze left past other.lat + 1.25*W!
          blockedLeftMax = Math.max(blockedLeftMax, other.lateralOffset + minCorridor);
        } else {
          // Other car has overlap on our RIGHT -> do not squeeze right past other.lat - 1.25*W!
          blockedRightMin = Math.min(blockedRightMin, other.lateralOffset - minCorridor);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. IDEAL RACING LINE, DEFENSIVE WALL & SLIPSTREAM SLING-SHOT
    // ------------------------------------------------------------------------
    let preferredLat = 0.0;
    const dominantK = Math.abs(lookK45) > Math.abs(curK) ? lookK45 : curK;
    if (Math.abs(dominantK) > 0.12) {
      // Apex target: Right turn (+k) -> +right (+4.9m); Left turn (-k) -> -right (-4.9m)
      preferredLat = Math.sign(dominantK) * (arch.id === 'APEX_TACTICIAN' ? 5.3 : 4.6);
    } else {
      // Straightaway setup: position on outside before upcoming corner!
      if (Math.abs(lookK95) > 0.25) {
        preferredLat = -Math.sign(lookK95) * 4.4;
      } else {
        preferredLat = (car.carNum % 2 === 0 ? 1 : -1) * 2.2;
      }
    }

    // DEFENSIVE_WALL (Senna-style): Cover inside lane on straights when Player closes within 25m!
    if (!isQualifying && arch.id === 'DEFENSIVE_WALL' && Math.abs(curK) < 0.12) {
      const playerBehindM = signedDeltaGameM(s, playerCar.s) * REAL_METERS_PER_GAME_METER;
      if (playerBehindM > 3.5 && playerBehindM <= arch.defensiveRangeM && !playerCar.exploded) {
        // Upcoming corner inside (Turn 1 is Right +k -> +lat; Turn 3 is Left -k -> -lat)
        const nextInsideSign = (s < 320 || s > 760) ? 1 : -1;
        preferredLat = nextInsideSign * 4.2 + (playerCar.lateralOffset - nextInsideSign * 4.2) * 0.35;
      }
    }

    // SLIPSTREAM TOW & SLING-SHOT PULL-OUT (Main Straight 0..240m & 300R Approach 730..790m)
    const inDraftZone = (s >= 0 && s <= 262) || (s >= 730 && s <= 785);
    // Pull out 120m (~27.5 game-meters) before Turn 1 (290m -> 262m) or Turn 3 (620m -> 592m)!
    const inSlingShotPullout = (s >= 258 && s <= 290) || (s >= 590 && s <= 622);

    if (inDraftZone && !inSlingShotPullout && !this.raceSystems.isSectorYellow(curSec.id)) {
      let bestDraftLeader = null;
      let bestDistM = 45.0;
      for (const other of allCars) {
        if (other === car || other.exploded || other.inPitLane) continue;
        const aheadM = forwardDistGameM(s, other.s) * REAL_METERS_PER_GAME_METER;
        if (aheadM > 11.0 && aheadM < bestDistM && other.speedKmh > 180) {
          bestDistM = aheadM;
          bestDraftLeader = other;
        }
      }
      if (bestDraftLeader) {
        preferredLat = bestDraftLeader.lateralOffset;
      }
    }

    // ------------------------------------------------------------------------
    // 4. 13 FORWARD RADAR RAYS (0m - 140m) SCORING CANDIDATE LANES
    // ------------------------------------------------------------------------
    const inYellow = this.raceSystems.isSectorYellow(curSec.id);
    const W = isClassic ? 0.0 : this.weather.grooveMoisture;

    let bestLane = car.lateralOffset;
    let bestScore = -1e9;
    let nearestBlockingCarSpeed = null;
    let nearestBlockingDistM = 999;

    for (const laneLat of FORWARD_RAY_LANES) {
      if (laneLat < blockedLeftMax || laneLat > blockedRightMin) continue;

      let score = -Math.abs(laneLat - preferredLat) * 2.4;
      // Smoothness penalty so AI doesn't weave erratically
      score -= Math.abs(laneLat - car.lateralOffset) * 1.35;

      // Scan 0m -> 140m ahead along this ray for cars, puddles & debris
      for (const other of allCars) {
        if (other === car || other.inPitLane) continue;
        const aheadM = forwardDistGameM(s, other.s) * REAL_METERS_PER_GAME_METER;
        if (aheadM > 0 && aheadM <= 140.0) {
          const latSep = Math.abs(laneLat - other.lateralOffset);
          if (latSep < CAR_WIDTH * 1.22) {
            const closing = car.speedKmh - other.speedKmh;
            if (other.exploded || closing > -8 || aheadM < 18.0) {
              const urgency = (145.0 - aheadM) / 140.0;
              score -= urgency * urgency * (other.exploded ? 190.0 : 95.0);
              if (Math.abs(car.lateralOffset - other.lateralOffset) < CAR_WIDTH * 1.15 && aheadM < nearestBlockingDistM) {
                nearestBlockingDistM = aheadM;
                nearestBlockingCarSpeed = other.speedKmh;
              }
            }
          }
        }
      }

      // Puddle hazard avoidance when W > 0.35 (or 1982 GP puddles)
      if ((isClassic && !isQualifying) || W > 0.35) {
        for (const p of this.track.puddles) {
          const aheadM = forwardDistGameM(s, p.s) * REAL_METERS_PER_GAME_METER;
          if (aheadM > 0 && aheadM <= 110.0) {
            const latSep = Math.abs(laneLat - p.lat);
            if (latSep < p.radius + 1.1) {
              score -= 42.0 * arch.puddleAvoidWeight * ((115.0 - aheadM) / 115.0);
            }
          }
        }
      }

      // Carbon fiber debris avoidance (2026 Mode)
      if (!isClassic) {
        for (const deb of this.raceSystems.effects.debrisItems) {
          const aheadM = forwardDistGameM(s, deb.s) * REAL_METERS_PER_GAME_METER;
          if (aheadM > 0 && aheadM <= 125.0) {
            const latSep = Math.abs(laneLat - deb.lateralOffset);
            if (latSep < deb.radius + 1.2) {
              score -= 75.0 * ((130.0 - aheadM) / 130.0);
            }
          }
        }
      }

      // LATE_BRAKER bonus for lunging down the inside lane at Turn 1 & Hairpin!
      if (arch.id === 'LATE_BRAKER' && inSlingShotPullout && !inYellow) {
        const insideSign = s < 400 ? 1 : -1;
        score += laneLat * insideSign * 1.9;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLane = laneLat;
      }
    }

    car.aiTargetLat = Math.max(-ROAD_HALF_WIDTH + 1.1, Math.min(ROAD_HALF_WIDTH - 1.1, bestLane));

    // ------------------------------------------------------------------------
    // 5. TARGET CORNERING & STRAIGHTAWAY SPEED SOLVER
    // ------------------------------------------------------------------------
    // In 1982 Qualifying, rival cars cruise slightly slower (205-255 km/h) like classic Namco traffic
    if (isClassic && isQualifying) {
      car._aiTargetSpeedKmh = 205 + (car.carNum % 5) * 11;
      return;
    }

    // Lookahead braking distance modulated by LATE_BRAKER (+12.5m deeper!) & ROOKIE variance (+-8m)
    const jitterM = (Math.sin(car.lap * 7.3 + car.carNum) * arch.brakeVarianceM);
    const brakeLookRealM = Math.max(28, 86.0 - arch.brakeOffsetM + jitterM) * (1.0 + W * 0.55);
    const brakeLookGameM = brakeLookRealM / REAL_METERS_PER_GAME_METER;

    let maxUpcomingK = Math.abs(curK);
    for (let stepG = 3; stepG <= brakeLookGameM; stepG += 4) {
      const kAhead = Math.abs(this.track.getPhysicsCurvature(s + stepG));
      if (kAhead > maxUpcomingK) maxUpcomingK = kAhead;
    }

    // Cornering speed ceiling from curvature & surface grip
    let cornerCapKmh = 314.0;
    if (maxUpcomingK > 0.75) {
      // Turn 3 Hairpin (-0.88)
      cornerCapKmh = 148.0;
    } else if (maxUpcomingK > 0.55) {
      // Turn 1 Daiichi (+0.68)
      cornerCapKmh = 176.0;
    } else if (maxUpcomingK > 0.36) {
      // Turn 2 100R (-0.42) & Turn 4 300R (+0.38)
      cornerCapKmh = 236.0;
    } else if (maxUpcomingK > 0.25) {
      cornerCapKmh = 262.0;
    }

    // Wet surface & worn tire adjustment
    const avgLife = (car.tires.FL.life + car.tires.FR.life + car.tires.RL.life + car.tires.RR.life) * 0.25;
    const tireFactor = isClassic ? 1.0 : (0.86 + avgLife * 0.14) * (1.0 - W * 0.22);
    let targetKmh = Math.min(312.0, cornerCapKmh * tireFactor * arch.basePace);

    // Local Yellow slows AI by 25% & prohibits overtaking!
    if (inYellow) {
      targetKmh *= 0.75;
      if (nearestBlockingCarSpeed !== null && nearestBlockingDistM < 28) {
        targetKmh = Math.min(targetKmh, nearestBlockingCarSpeed - 2);
      }
    } else if (nearestBlockingCarSpeed !== null && nearestBlockingDistM < 11.0) {
      // Emergency anti-rear-end if boxed in with no clear lateral lane!
      targetKmh = Math.min(targetKmh, nearestBlockingCarSpeed - 5);
    }

    if (this.raceSystems.vscActive) {
      targetKmh = Math.min(targetKmh, 158.0);
    }

    car._aiTargetSpeedKmh = Math.max(70.0, targetKmh);
  }

  _evaluateAIPitStrategy(car, arch, totalLaps) {
    const minLife = Math.min(car.tires.FL.life, car.tires.FR.life, car.tires.RL.life, car.tires.RR.life);
    const W = this.weather.grooveMoisture;
    const isWetCompound = car.compound === 'INTERMEDIATE' || car.compound === 'FULL_WET';

    const wrongTireForRain =
      (!isWetCompound && W > 0.30) ||
      (car.compound === 'INTERMEDIATE' && W > 0.68) ||
      (isWetCompound && W < 0.07);

    // APEX_TACTICIAN undercuts 1 lap earlier (pits at 34% tire life instead of 26%);
    // VSC active prompts smart opportunistic "cheap stops" if life < 58%!
    const lifeThreshold = this.raceSystems.vscActive
      ? 0.58
      : (0.27 + arch.undercutLapsEarly * 0.07);

    const needsFuel = car.fuelLaps < 1.35;
    const needsDamageFix = car.damage.hasPuncture || car.damage.frontWing > 0.60 || car.damage.suspension > 0.65;

    if (minLife < lifeThreshold || needsFuel || wrongTireForRain || needsDamageFix) {
      car.aiWantsToPit = true;
      const lapsLeft = Math.max(2, totalLaps - car.lap + 1);

      let nextComp = arch.preferredDryTire || 'MEDIUM';
      if (W > 0.58) nextComp = 'FULL_WET';
      else if (W > 0.18) nextComp = 'INTERMEDIATE';
      else if (lapsLeft <= 5) nextComp = 'SOFT';
      else if (lapsLeft >= 10) nextComp = 'HARD';

      car.aiPitPlan = {
        nextCompound: nextComp,
        fuelToAdd: 'FILL',
        repairOrder: (car.damage.frontWing > 0.45 || car.damage.rearWing > 0.45) ? 'WINGS' : 'NONE',
        crewPushMode: arch.id === 'APEX_TACTICIAN' ? 'AGGRESSIVE_UNDERCUT' : 'BALANCED',
      };
    }
  }
}
