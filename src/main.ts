import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, initResizeObserver, setBloom, setRenderBundles, setGbufferCompression, useGbufferCompression } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights, stopTime } from './stage/lights';
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
        case renderModes.clusterForward:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
    }
}

export function getRenderMode() {
    return renderModeController.getValue();
}

const renderModes = { naive: 'naive', clusterForward: 'cluster forward', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.clusterForward }, 'mode', renderModes);

let globalSettings = {
    enableBloom: false,
    stopTime: false,
    useRenderBundles: false,
    useGbufferCompression: false
};
let bloomController = gui.add(globalSettings, 'enableBloom').name('Enable Bloom');
bloomController.onChange(function(value) {
    //console.log('Bloom is now ' + (value ? 'enabled' : 'disabled'));
    setBloom(value);
});

let stopTimeController = gui.add(globalSettings, 'stopTime').name('Stop Time');
stopTimeController.onChange(function(value) {
    //console.log('Time is now ' + (value ? 'stopped' : 'running'));
    stopTime(value);
});

let useRenderBundlesController = gui.add(globalSettings, 'useRenderBundles').name('RenderBundles');
useRenderBundlesController.onChange(function(value) {
    //console.log('Render Bundles are now ' + (value ? 'enabled' : 'disabled'));
    setRenderBundles(value);
});

let useGbufferCompressionController = gui.add(globalSettings, 'useGbufferCompression').name('Gbuffer Compress');
useGbufferCompressionController.onChange(function(value) {
    //console.log('Gbuffer Compression is now ' + (value ? 'enabled' : 'disabled'));
    setGbufferCompression(value);
});

renderModeController.onChange(setRenderer);
initResizeObserver(setRenderer, getRenderMode);

setRenderer(renderModeController.getValue());
