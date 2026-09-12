export class EMAFilter {
    private alpha: number;
    private value: number | null = null;

    constructor(alpha: number = 0.2) {
        this.alpha = alpha;
    }

    reset() {
        this.value = null;
    }

    update(newValue: number): number {
        if (this.value === null) {
            this.value = newValue;
        } else {
            this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
        }
        return this.value;
    }

    get(): number | null {
        return this.value;
    }
}
