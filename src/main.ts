import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';
import { ClusteredDeferredPackedRenderer } from './renderers/clustered_deferred_packed';
import { DebugShaderRenderer } from './renderers/debug_shader';

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
        case renderModes.clusteredForward:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
        case renderModes.debugShader:
            renderer = new DebugShaderRenderer(stage);
            break;
        case renderModes.packedClusteredDeferred:
            renderer = new ClusteredDeferredPackedRenderer(stage);
            break;
    }
}

const renderModes = { naive: 'naive', clusteredForward: 'forward+', clusteredDeferred: 'clustered deferred', packedClusteredDeferred: 'packed clustered deferred', debugShader: 'debug shader'};
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());
