export interface MouseState {
  current: { x: number; y: number };
  previous: { x: number; y: number };
  velocity: number;
  normalized: { x: number; y: number };
  prevNormalized: { x: number; y: number };
  isMoving: boolean;
}

export class MouseTracker {
  private state: MouseState = {
    current: { x: 0, y: 0 },
    previous: { x: 0, y: 0 },
    velocity: 0,
    normalized: { x: 0.5, y: 0.5 },
    prevNormalized: { x: 0.5, y: 0.5 },
    isMoving: false,
  };

  private element: HTMLElement;
  private boundHandlers: {
    move: (e: MouseEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchStart: (e: TouchEvent) => void;
    leave: () => void;
  };

  // Idle detection
  private idleTimeout: number = 50; // ms
  private movementEpsilon: number = 0.0005; // normalized distance threshold
  private idleTimer: number | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    this.boundHandlers = {
      move: this.handleMouseMove.bind(this),
      touchMove: this.handleTouchMove.bind(this),
      touchStart: this.handleTouchStart.bind(this),
      leave: this.handleMouseLeave.bind(this),
    };
    this.attach();
  }

  private attach() {
    this.element.addEventListener('mousemove', this.boundHandlers.move, { passive: true });
    this.element.addEventListener('touchmove', this.boundHandlers.touchMove, { passive: true });
    this.element.addEventListener('touchstart', this.boundHandlers.touchStart, { passive: true });
    this.element.addEventListener('mouseleave', this.boundHandlers.leave);
  }

  private detach() {
    this.element.removeEventListener('mousemove', this.boundHandlers.move);
    this.element.removeEventListener('touchmove', this.boundHandlers.touchMove);
    this.element.removeEventListener('touchstart', this.boundHandlers.touchStart);
    this.element.removeEventListener('mouseleave', this.boundHandlers.leave);
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
  }

  private handleMouseMove(event: MouseEvent) {
    this.updateFromClientCoords(event.clientX, event.clientY);
  }

  private handleTouchMove(event: TouchEvent) {
    if (event.touches.length > 0) {
      this.updateFromClientCoords(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  private handleTouchStart(event: TouchEvent) {
    if (event.touches.length > 0) {
      this.updateFromClientCoords(event.touches[0].clientX, event.touches[0].clientY);
      this.state.previous = { ...this.state.current };
      this.state.prevNormalized = { ...this.state.normalized };
    }
  }

  private handleMouseLeave() {
    // Don't reset - let ripples decay naturally
  }

  private updateFromClientCoords(clientX: number, clientY: number) {
    const rect = this.element.getBoundingClientRect();

    // Store previous
    this.state.previous = { ...this.state.current };
    this.state.prevNormalized = { ...this.state.normalized };

    // Update current
    this.state.current.x = clientX - rect.left;
    this.state.current.y = clientY - rect.top;

    // Normalized UV (0-1), invert Y for WebGL
    this.state.normalized.x = this.state.current.x / rect.width;
    this.state.normalized.y = 1.0 - this.state.current.y / rect.height;

    // Clamp
    this.state.normalized.x = Math.max(0, Math.min(1, this.state.normalized.x));
    this.state.normalized.y = Math.max(0, Math.min(1, this.state.normalized.y));

    // Calculate velocity
    const dx = this.state.normalized.x - this.state.prevNormalized.x;
    const dy = this.state.normalized.y - this.state.prevNormalized.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.state.velocity = distance;

    // Check for meaningful movement (above epsilon)
    if (distance > this.movementEpsilon) {
      this.state.isMoving = true;
      this.resetIdleTimer();
    }
    // If movement is below epsilon, don't change isMoving yet - let idle timer handle it
  }

  private resetIdleTimer() {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      this.state.isMoving = false;
      this.idleTimer = null;
    }, this.idleTimeout);
  }

  public getState(): Readonly<MouseState> {
    return this.state;
  }

  public destroy() {
    this.detach();
  }
}