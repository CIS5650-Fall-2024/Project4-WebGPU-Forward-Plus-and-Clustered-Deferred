import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// Add custom panel for average render time
const renderTimePanel = stats.addPanel(new Stats.Panel('Delta (ms)', '#0ff', '#002'));
stats.showPanel(1); // Show the new render time panel by default

let lastTime = performance.now();
let frameCount = 0;
let totalRenderTime = 0;

function updateStats() {
    const currentTime = performance.now();
    const renderTime = currentTime - lastTime;
    lastTime = currentTime;

    frameCount++;
    totalRenderTime += renderTime;

    if (frameCount >= 15) { // Update every 15 frames
        const avgRenderTime = totalRenderTime / frameCount;
        renderTimePanel.update(avgRenderTime, 100); // 100 ms as max value, adjust if needed
        frameCount = 0;
        totalRenderTime = 0;
    }

    stats.update();
    requestAnimationFrame(updateStats);
}

updateStats();

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
    }
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());
