import { Camera } from "./camera";
import { FrameStats } from "./framestats";
import { Lights } from "./lights";
import { Scene } from "./scene";

export class Stage {
    scene: Scene;
    lights: Lights;
    camera: Camera;
    stats: Stats;
    frameStats : FrameStats;

    constructor(scene: Scene, lights: Lights, camera: Camera, stats: Stats, frameStats : FrameStats) {
        this.scene = scene;
        this.lights = lights;
        this.camera = camera;
        this.stats = stats;
        this.frameStats = frameStats;
    }
}
