// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from "../stage/camera";

import commonRaw from "./common.wgsl?raw";

import naiveVertRaw from "./naive.vs.wgsl?raw";
import naiveFragRaw from "./naive.fs.wgsl?raw";

import forwardPlusFragRaw from "./forward_plus.fs.wgsl?raw";
import forwardPlusVertRaw from "./forward_plus.vs.wgsl?raw";
import forwardPlusPassthroughRaw from "./forward_plus_passthrough.fs.wgsl?raw";
import forwardPlusBboxRaw from "./forward_plus_bbox.cs.wgsl?raw";
import forwardPlusLightcullRaw from "./forward_plus_cull.cs.wgsl?raw";

import clusteredDeferredFragRaw from "./clustered_deferred.fs.wgsl?raw";
import clusteredDeferredFullscreenVertRaw from "./clustered_deferred_fullscreen.vs.wgsl?raw";
import clusteredDeferredFullscreenFragRaw from "./clustered_deferred_fullscreen.fs.wgsl?raw";

import moveLightsComputeRaw from "./move_lights.cs.wgsl?raw";
import clusteringComputeRaw from "./clustering.cs.wgsl?raw";

import debugComputeRaw from "./debug.cs.wgsl?raw";

import optimizedDeferredFragRaw from "./optimized_deferred.fs.wgsl?raw";
import optimizedDeferredFullscreenFragRaw from "./optimized_deferred_fullscreen.fs.wgsl?raw";
import optimizedDeferredFullscreenComputeRaw from "./optimized_deferred.cs.wgsl?raw";
import bloomComputeRaw from "./bloom.cs.wgsl?raw";
import bloomWriteBackComputeRaw from "./bloom_write_back.cs.wgsl?raw";

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    bindGroup_lightcull: 3,

    moveLightsWorkgroupSize: 128,
    maxLightsPerTile: 1000,

    tileSize: 64,
    tileSizeZ: 16,
    lightCullBlockSize: 8,

    lightRadius: 2,
};

// =================================

function evalShaderRaw(raw: string) {
    return eval("`" + raw.replaceAll("${", "${constants.") + "`");
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);
export const forwardPlusVertSrc: string = processShaderRaw(forwardPlusVertRaw);
export const forwardPlusPassthroughSrc: string = processShaderRaw(forwardPlusPassthroughRaw);
export const forwardPlusBboxSrc: string = processShaderRaw(forwardPlusBboxRaw);
export const forwardPlusLightcullSrc: string = processShaderRaw(forwardPlusLightcullRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);

export const debugComputeSrc: string = processShaderRaw(debugComputeRaw);

export const optimizedDeferredFragSrc: string = processShaderRaw(optimizedDeferredFragRaw);
export const optimizedDeferredFullscreenFragSrc: string = processShaderRaw(optimizedDeferredFullscreenFragRaw);
export const optimizedDeferredFullscreenComputeSrc: string = processShaderRaw(optimizedDeferredFullscreenComputeRaw);
export const bloomComputeSrc: string = processShaderRaw(bloomComputeRaw);
export const bloomWriteBackComputeSrc: string = processShaderRaw(bloomWriteBackComputeRaw);
