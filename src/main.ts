import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';
import { OptimizedClusteredDeferredRenderer } from './renderers/optimized_clustered_deferred.ts';
import { PostProcessingRenderer } from './renderers/post_processing.ts';
import { PackedClusteredDeferredRenderer } from './renderers/packed_clustered_deferred';

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
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
        // case renderModes.packedClusteredDeferred:
        //     renderer = new PackedClusteredDeferredRenderer(stage);
        //     break;
        // case renderModes.optimizedClusteredDeferred:
        //     renderer = new OptimizedClusteredDeferredRenderer(stage);
        //     break;
        // case renderModes.postProcessing:
        //     renderer = new PostProcessingRenderer(stage);
        //     break;
    }
}

const renderModes = {
     naive: 'naive',
     forwardPlus: 'forward+',
    clusteredDeferred: 'clustered deferred',
    //packedClusteredDeferred: 'packed clustered deferred',
    // optimizedClusteredDeferred: 'optimized clustered deferred',
    // postProcessing: 'post-processing',
 };
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());
