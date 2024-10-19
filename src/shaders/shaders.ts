// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code
import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import optimizedDeferredFragRaw from './optimized_deferred.fs.wgsl?raw';
import optimizedDeferredFullscreenVertRaw from './optimized_deferred_fullscreen.vs.wgsl?raw';
import optimizedDeferredFullscreenFragRaw from './optimized_deferred_fullscreen.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,

    moveLightsWorkgroupSize: 256,
    clusteringWorkgroupSizeX: 16,
    clusteringWorkgroupSizeY: 12,
    clusteringWorkgroupSizeZ: 1,

    // For clustering
    clusteringCountX: 16,
    clusteringCountY: 12,
    clusteringCountZ: 100,
    clusteringCountTotal: 16 * 12 * 100,
    maxNumLightsPerCluster: 500,

    farClip: 20.0,
    nearClip: 3.0,

    lightRadius: 2.0
};

// =================================

function evalShaderRaw(raw: string) {
    return eval('`' + raw.replaceAll('${', '${constants.') + '`');
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const optimizedDeferredFragSrc: string = processShaderRaw(optimizedDeferredFragRaw);
export const optimizedDeferredFullscreenVertSrc: string = processShaderRaw(optimizedDeferredFullscreenVertRaw);
export const optimizedDeferredFullscreenFragSrc: string = processShaderRaw(optimizedDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
