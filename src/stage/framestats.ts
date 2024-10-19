export class FrameStats {
    startTime : DOMHighResTimeStamp;
    timeElapsed: DOMHighResTimeStamp;
    numFrames : number;
    frameTime : number;

    constructor() {
        this.startTime = performance.now();
        this.timeElapsed = 0;
        this.numFrames = 0;
        this.frameTime = 0;
    }

    reset(time : DOMHighResTimeStamp) {
        this.startTime = time;
        this.timeElapsed = 0;
        this.numFrames = 0;
        this.frameTime = 0;
    }

    update(time : DOMHighResTimeStamp) {
        this.timeElapsed = time - this.startTime;
        this.numFrames += 1;
        this.frameTime = this.timeElapsed / this.numFrames;
    }
};