// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Ergonomic Mobile Multi-Touch Controls (Left/Right Handed) + Keyboard/Gamepad
// ============================================================================

export class ErgonomicControls {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; // { onShift(dir), onClutchTap(), onUserInteract() }
    this.handedness = 'RIGHT_HANDED'; // 'RIGHT_HANDED' | 'LEFT_HANDED'

    // Active normalized outputs
    this.steer = 0.0;    // [-1..1]
    this.throttle = 0.0; // [0..1]
    this.brake = 0.0;    // [0..1]

    // Pointer tracking
    this.wheelPointerId = null;
    this.wheelTouchSteer = 0.0;
    this.pedalPointerId = null;
    this.touchGas = 0.0;
    this.touchBrake = 0.0;

    // Keyboard state
    this.keys = new Set();
    this.kbSteer = 0.0;

    this._bindDOM();
    this._bindKeyboard();
  }

  _bindDOM() {
    this.hudControlsEl = document.getElementById('mobile-controls-layer');
    this.wheelZoneEl = document.getElementById('touch-wheel-zone');
    this.wheelGraphicEl = document.getElementById('virtual-wheel-graphic');
    this.wheelReadoutEl = document.getElementById('wheel-angle-readout');

    this.pedalZoneEl = document.getElementById('touch-pedal-zone');
    this.gasFillEl = document.getElementById('pedal-gas-fill');
    this.brakeFillEl = document.getElementById('pedal-brake-fill');
    this.gasPctEl = document.getElementById('pedal-gas-pct');
    this.brakePctEl = document.getElementById('pedal-brake-pct');

    this.shifterBtnEl = document.getElementById('touch-shifter-btn');
    this.shiftDownBtnEl = document.getElementById('touch-shift-down-btn');
    this.shiftUpBtnEl = document.getElementById('touch-shift-up-btn');

    // Prevent context menu & browser scroll zoom on touch controls
    if (this.hudControlsEl) {
      this.hudControlsEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // 1. Virtual Force-Feedback Steering Wheel Zone
    if (this.wheelZoneEl) {
      this.wheelZoneEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.wheelPointerId === null) {
          this.wheelPointerId = e.pointerId;
          this.wheelZoneEl.setPointerCapture(e.pointerId);
          this._updateWheelFromPointer(e);
        }
      });

      this.wheelZoneEl.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.wheelPointerId) {
          e.preventDefault();
          this._updateWheelFromPointer(e);
        }
      });

      const releaseWheel = (e) => {
        if (e.pointerId === this.wheelPointerId) {
          this.wheelPointerId = null;
          this.wheelTouchSteer = 0.0;
        }
      };
      this.wheelZoneEl.addEventListener('pointerup', releaseWheel);
      this.wheelZoneEl.addEventListener('pointercancel', releaseWheel);
    }

    // 2. Unified Analog Pressure-Slide Gas/Brake Pedal Zone (with Trail-Brake Rollover!)
    if (this.pedalZoneEl) {
      this.pedalZoneEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
        if (this.pedalPointerId === null) {
          this.pedalPointerId = e.pointerId;
          this.pedalZoneEl.setPointerCapture(e.pointerId);
          this._updatePedalsFromPointer(e);
        }
      });

      this.pedalZoneEl.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.pedalPointerId) {
          e.preventDefault();
          this._updatePedalsFromPointer(e);
        }
      });

      const releasePedals = (e) => {
        if (e.pointerId === this.pedalPointerId) {
          this.pedalPointerId = null;
          this.touchGas = 0.0;
          this.touchBrake = 0.0;
        }
      };
      this.pedalZoneEl.addEventListener('pointerup', releasePedals);
      this.pedalZoneEl.addEventListener('pointercancel', releasePedals);
    }

    // 3. LOW/HIGH Shifter Toggle & 6-Speed Sequential Buttons
    if (this.shifterBtnEl) {
      this.shifterBtnEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._vibrate(18);
        if (this.callbacks.onShift) this.callbacks.onShift(0); // Toggle LOW <-> HIGH
      });
    }
    if (this.shiftDownBtnEl) {
      this.shiftDownBtnEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._vibrate(15);
        if (this.callbacks.onShift) this.callbacks.onShift(-1);
      });
    }
    if (this.shiftUpBtnEl) {
      this.shiftUpBtnEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._vibrate(15);
        if (this.callbacks.onShift) this.callbacks.onShift(+1);
      });
    }
  }

  _updateWheelFromPointer(e) {
    const rect = this.wheelZoneEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const dxNorm = (e.clientX - cx) / (rect.width * 0.42);
    this.wheelTouchSteer = Math.max(-1.0, Math.min(1.0, dxNorm));
  }

  _updatePedalsFromPointer(e) {
    const rect = this.pedalZoneEl.getBoundingClientRect();
    // Vertical analog pressure: bottom of pedal = 15% light touch, top 80% = 100% full pressure
    const yFromBottom = (rect.bottom - e.clientY) / rect.height;
    const pressure = Math.max(0.0, Math.min(1.0, (yFromBottom - 0.04) / 0.78));

    // Horizontal position across [Brake | Trail-Brake Bridge | Gas]
    // In RIGHT_HANDED: Brake is inner-left (0..0.44), Bridge (0.38..0.62), Gas is outer-right (0.56..1.0)
    // In LEFT_HANDED: Mirrored so Gas is outer-left (0..0.44), Bridge (0.38..0.62), Brake is inner-right (0.56..1.0)
    let xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (this.handedness === 'LEFT_HANDED') {
      xNorm = 1.0 - xNorm;
    }

    if (xNorm < 0.38) {
      // Pure Brake pedal
      this.touchBrake = pressure;
      this.touchGas = 0.0;
    } else if (xNorm > 0.62) {
      // Pure Gas pedal
      this.touchGas = pressure;
      this.touchBrake = 0.0;
    } else {
      // Seamless horizontal rollover trail-braking zone!
      const u = (xNorm - 0.38) / (0.62 - 0.38); // 0 = Brake side, 1 = Gas side
      this.touchBrake = pressure * (1.0 - u * 0.85);
      this.touchGas = pressure * (0.15 + u * 0.85);
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        if (document.activeElement?.tagName !== 'INPUT') e.preventDefault();
      }
      if (!this.keys.has(code)) {
        this.keys.add(code);
        if (code === 'Space') {
          if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
          if (this.callbacks.onShift) this.callbacks.onShift(0);
        } else if (code === 'KeyE' || code === 'ShiftRight') {
          if (this.callbacks.onShift) this.callbacks.onShift(+1);
        } else if (code === 'KeyQ' || code === 'ShiftLeft') {
          if (this.callbacks.onShift) this.callbacks.onShift(-1);
        } else if (code === 'KeyV') {
          if (this.callbacks.onToggleVisualStyle) this.callbacks.onToggleVisualStyle();
        } else if (code === 'KeyC') {
          if (this.callbacks.onCycleCamera) this.callbacks.onCycleCamera();
        } else if (code === 'KeyP') {
          if (this.callbacks.onTogglePitDrawer) this.callbacks.onTogglePitDrawer();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  setHandedness(handedness) {
    this.handedness = handedness === 'LEFT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED';
    if (this.hudControlsEl) {
      this.hudControlsEl.classList.toggle('left-handed', this.handedness === 'LEFT_HANDED');
      this.hudControlsEl.classList.toggle('right-handed', this.handedness !== 'LEFT_HANDED');
    }
  }

  setGearboxUI(gearboxMode, currentGear) {
    const is6Spd = gearboxMode === 'PRO_6SPD';
    if (this.shifterBtnEl) {
      this.shifterBtnEl.style.display = is6Spd ? 'none' : 'flex';
      if (!is6Spd) {
        const isHigh = currentGear >= 2;
        this.shifterBtnEl.innerHTML = `<span class="shifter-label">GEAR</span><span class="shifter-val ${isHigh ? 'high' : 'low'}">${isHigh ? 'HIGH' : 'LOW'}</span>`;
      }
    }
    const seqWrap = document.getElementById('seq-shifter-wrap');
    if (seqWrap) {
      seqWrap.style.display = is6Spd ? 'flex' : 'none';
      const gearDisp = document.getElementById('seq-gear-num');
      if (gearDisp) gearDisp.textContent = `G${currentGear}`;
    }
  }

  update(dt, playerCar) {
    // Keyboard steering smoothing
    const leftDown = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const rightDown = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const targetKbSteer = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    if (targetKbSteer !== 0) {
      this.kbSteer += (targetKbSteer - this.kbSteer) * Math.min(1, dt * 8.5);
    } else {
      this.kbSteer += (0 - this.kbSteer) * Math.min(1, dt * 11.0);
      if (Math.abs(this.kbSteer) < 0.005) this.kbSteer = 0;
    }

    const kbGas = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1.0 : 0.0;
    const kbBrake = (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? 1.0 : 0.0;

    // Optional HTML5 Gamepad polling
    let gpSteer = 0, gpGas = 0, gpBrake = 0;
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const gp = pads && pads[0];
      if (gp) {
        if (Math.abs(gp.axes[0]) > 0.08) gpSteer = gp.axes[0];
        if (gp.buttons[7]?.value > 0.04) gpGas = gp.buttons[7].value;
        if (gp.buttons[6]?.value > 0.04) gpBrake = gp.buttons[6].value;
      }
    }

    // Combine touch + keyboard + gamepad with centering spring on wheel release
    if (this.wheelPointerId !== null) {
      this.steer += (this.wheelTouchSteer - this.steer) * Math.min(1, dt * 22.0);
    } else if (Math.abs(this.kbSteer) > 0.005 || Math.abs(gpSteer) > 0.05) {
      const src = Math.abs(gpSteer) > Math.abs(this.kbSteer) ? gpSteer : this.kbSteer;
      this.steer = src;
    } else {
      // Centering spring return
      this.steer += (0.0 - this.steer) * Math.min(1, dt * 10.5);
      if (Math.abs(this.steer) < 0.003) this.steer = 0.0;
    }

    this.throttle = Math.max(this.touchGas, kbGas, gpGas);
    this.brake = Math.max(this.touchBrake, kbBrake, gpBrake);

    // Visual Force-Feedback Steering Wheel rotation + curb vibration kick!
    let ffbJitterDeg = 0;
    if (playerCar && !playerCar.exploded && playerCar.speedKmh > 30) {
      if (playerCar.onCurb) {
        ffbJitterDeg = Math.sin(performance.now() * 0.085) * 5.5;
        this._vibrateCurbPulse();
      } else if (playerCar.aquaplaneTimer > 0) {
        ffbJitterDeg = Math.sin(performance.now() * 0.06) * 11.0;
      } else if (playerCar.skidIntensity > 0.35) {
        ffbJitterDeg = Math.sin(performance.now() * 0.05) * 3.5;
      }
    }

    const wheelDeg = this.steer * 130.0 + ffbJitterDeg;
    if (this.wheelGraphicEl) {
      this.wheelGraphicEl.style.transform = `rotate(${wheelDeg.toFixed(1)}deg)`;
    }
    if (this.wheelReadoutEl) {
      this.wheelReadoutEl.textContent = `${Math.round(this.steer * 130)}°`;
    }

    // Update analog pedal pressure fill bars
    const gasPct = Math.round(this.throttle * 100);
    const brkPct = Math.round(this.brake * 100);
    if (this.gasFillEl) this.gasFillEl.style.height = `${gasPct}%`;
    if (this.brakeFillEl) this.brakeFillEl.style.height = `${brkPct}%`;
    if (this.gasPctEl) this.gasPctEl.textContent = `${gasPct}%`;
    if (this.brakePctEl) this.brakePctEl.textContent = `${brkPct}%`;
  }

  _vibrate(ms) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (_) {}
    }
  }

  _vibrateCurbPulse() {
    const now = performance.now();
    if (!this._lastVib || now - this._lastVib > 90) {
      this._lastVib = now;
      this._vibrate(12);
    }
  }
}
