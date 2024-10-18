// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';
import preDepthFragRaw from './pre_depth.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import clusteredDeferredOptimFrag from './clustered_deferred_opim.fs.wgsl?raw';
import clusteredDeferredOptimFullscreenFrag from './clustered_deferred_optim_fullscreen.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';
import clusterBoundComputeRaw from './clustered_bounds.cs.wgsl?raw';

import depthVisualVertRaw from './visualize_depth.vs.wgsl?raw';
import depthVisualFragRaw from './visualize_depth.fs.wgsl?raw';

import bloomExtractBrightnessComputeRaw from './bloom/extract_brightness.cs.wgsl?raw';
import bloomBlurBoxComputeRaw from './bloom/box_blur.cs.wgsl?raw';
import bloomBlurGaussianComputeRaw from './bloom/gaussian_blur.cs.wgsl?raw';
import bloomCompositeComputeRaw from './bloom/composite.cs.wgsl?raw';
import bloomCompositeFragRaw from './bloom/composite.fs.wgsl?raw';

import bloomCopyVertRaw from './bloom/bloomCopy.vs.wgsl?raw';
import bloomCopyFragRaw from './bloom/bloomCopy.fs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    bindGroup_Gbuffer: 3,
    bindGroup_cluster: 0,

    clusterMaxLights: 1000,
    clusterSize: [32, 18, 48],
    bloomKernelSize: [16, 16],
    clusterBoundByteSize:32,
    clusterLightByteSize: 8,
    moveLightsWorkgroupSize: 128, 
    lightRadius: 3,
    bloomBlurTimes: 1
};

// =================================

function evalShaderRaw(raw: string) {
    return eval('`' + raw.replaceAll('${', '${constants.') + '`');
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    //console.log(commonSrc + evalShaderRaw(raw));
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);
export const preDepthFragSrc: string = processShaderRaw(preDepthFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const clusteredDeferredOptimFragSrc: string = processShaderRaw(clusteredDeferredOptimFrag);
export const clusteredDeferredOptimFullscreenFragSrc: string = processShaderRaw(clusteredDeferredOptimFullscreenFrag);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
export const clusterBoundComputeSrc: string = processShaderRaw(clusterBoundComputeRaw);

export const depthVisualVertSrc: string = processShaderRaw(depthVisualVertRaw);
export const depthVisualFragSrc: string = processShaderRaw(depthVisualFragRaw);

export const bloomExtractBrightnessComputeSrc: string = processShaderRaw(bloomExtractBrightnessComputeRaw);
export const bloomBlurBoxComputeSrc: string = processShaderRaw(bloomBlurBoxComputeRaw);
export const bloomBlurGaussianComputeSrc: string = processShaderRaw(bloomBlurGaussianComputeRaw);
export const bloomCompositeComputeSrc: string = processShaderRaw(bloomCompositeComputeRaw);
export const bloomCompositeFragSrc: string = processShaderRaw(bloomCompositeFragRaw);

export const bloomCopyVertSrc: string = processShaderRaw(bloomCopyVertRaw);
export const bloomCopyFragSrc: string = processShaderRaw(bloomCopyFragRaw);