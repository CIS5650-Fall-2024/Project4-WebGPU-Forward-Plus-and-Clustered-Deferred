import { vec3, Vec4 } from "wgpu-matrix";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights =  4096;
    lightArraySize = 0;
    static readonly maxNumLights = 8192;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    zbinsArray = new Uint32Array(shaders.constants.zBinSize);
    zbinsStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    bitonicSortPipelineLayout: GPUPipelineLayout;
    bitonicSortPipeline: GPUComputePipeline[];

    zbinningLightBindGroupLayout: GPUBindGroupLayout;
    zbinningLightBindGroup: GPUBindGroup;
    zbinningLightPipeline: GPUComputePipeline;

    clusterWidth: number;
    clusterHeight: number;
    clusterNum: number;
    lightsClusterArray: Uint32Array;
    lightsClusterStorageBuffer: GPUBuffer;
    lightClustersBindGroupLayout: GPUBindGroupLayout;
    lightClustersBindGroup: GPUBindGroup;
    lightClustersPipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;
        this.bitonicSortPipeline = [];
        this.lightArraySize = 1 << Math.ceil(Math.log2(this.numLights));

        this.sceneUniformsBindGroupLayout = device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.sceneUniformsBindGroup = device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.timeUniformBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.moveLightsComputeBindGroupLayout
                 ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.bitonicSortPipelineLayout = device.createPipelineLayout({
            label: "bitonic compute pipeline layout",
            bindGroupLayouts: [
                this.moveLightsComputeBindGroupLayout
             ]
        });

        this.updateLightSetUniformNumLights();


        // fill zbins with MAX_UINT32
        this.zbinsStorageBuffer = device.createBuffer({
            label: "zbins",
            size: this.zbinsArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        for (let i = 0; i < this.zbinsArray.length; i++) {
            this.zbinsArray[i] = 0xFFFFFFFF;
        }
        device.queue.writeBuffer(this.zbinsStorageBuffer, 0, this.zbinsArray.buffer);

        this.zbinningLightBindGroupLayout = device.createBindGroupLayout({
            label: "Z binning compute bind group layout",
            entries: [
                { // z bins
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.zbinningLightBindGroup = device.createBindGroup({
            label: "Z binning compute bind group",
            layout: this.zbinningLightBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.zbinsStorageBuffer }
                }
            ]
        });

        // create the zbinning compute pipeline
        this.zbinningLightPipeline = device.createComputePipeline({
            label: "Z binning compute pipeline",
            layout: device.createPipelineLayout({
                label: "Z binning compute pipeline layout",
                bindGroupLayouts: [
                    this.moveLightsComputeBindGroupLayout,
                    this.zbinningLightBindGroupLayout
                 ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "z binning compute shader",
                    code: shaders.zbinningLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });


        // create the light clustering pipeline
        this.clusterWidth = Math.ceil(canvas.width / shaders.constants.tileSize);
        this.clusterHeight = Math.ceil(canvas.height / shaders.constants.tileSize);
        this.clusterNum = this.clusterWidth * this.clusterHeight;
        this.lightsClusterArray = new Uint32Array(this.clusterNum * shaders.constants.maxLightsPerTile);

        this.lightsClusterStorageBuffer = device.createBuffer({
            label: "light cluster",
            size: 16 + this.lightsClusterArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        for (let i = 0; i < this.lightsClusterArray.length; i++) {
            this.lightsClusterArray[i] = 0xFFFFFFFF;
        }
        // write cluster raw data and dimensions
        device.queue.writeBuffer(this.lightsClusterStorageBuffer, 16, this.lightsClusterArray.buffer);
        device.queue.writeBuffer(this.lightsClusterStorageBuffer, 0, new Uint32Array([this.clusterWidth, this.clusterHeight]));

        this.lightClustersBindGroupLayout = device.createBindGroupLayout({
            label: "Light clustering compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusters
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.lightClustersBindGroup = device.createBindGroup({
            label: "Light clustering compute bind group",
            layout: this.lightClustersBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightsClusterStorageBuffer }
                }
            ]
        });

        this.lightClustersPipeline = device.createComputePipeline({
            label: "Light clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "Light clustering compute pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.lightClustersBindGroupLayout
                 ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "Light clustering compute shader",
                    code: shaders.lightClustersComputeSrc
                }),
                entryPoint: "main"
            }
        });

    }

    private populateLightsBuffer() {
        let lightUintView = new Uint32Array(this.lightsArray.buffer);
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
            lightUintView.set([lightIdx], (lightIdx * Lights.numFloatsPerLight) + 7);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray.buffer);
    }

    private constructBitonicSortPipeline() {
        // clear the old pipelines
        this.bitonicSortPipeline.length = 0;

        let shaderModule = device.createShaderModule({
            label: "bitonic compute shader",
            code: shaders.bitonicSortComputeSrc
        })

        for (let k = 2; k <= this.lightArraySize; k <<= 1){
            for (let j = k >> 1; j > 0; j >>= 1){
              this.bitonicSortPipeline.push(
                device.createComputePipeline({
                  layout: this.bitonicSortPipelineLayout,
                  compute: {
                    module: shaderModule,
                    entryPoint: 'main',
                    constants: {
                      1: j,
                      2: k,
                    }
                  },
                })
              );
            }
        }

    }

    updateLightSetUniformNumLights() {
        this.lightArraySize = 1 << Math.ceil(Math.log2(this.numLights));
        console.log("light size: %d", this.lightArraySize);
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
        this.constructBitonicSortPipeline();
        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray.buffer);
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number, doCluster: boolean) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.sceneUniformsBindGroup);
        computePass.setBindGroup(1, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        if (doCluster)
        {
        // sort the lights by z
        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);
        let sortWorkgroupCount = Math.ceil(this.lightArraySize / shaders.constants.moveLightsWorkgroupSize);
        for (let pipeline of this.bitonicSortPipeline) {
            computePass.setPipeline(pipeline);
            computePass.dispatchWorkgroups(sortWorkgroupCount);
        }

        // do z binning
        computePass.setBindGroup(1, this.zbinningLightBindGroup);
        computePass.setPipeline(this.zbinningLightPipeline);
        computePass.dispatchWorkgroups(1);

        // do light clustering
        computePass.setBindGroup(0, this.sceneUniformsBindGroup);
        computePass.setBindGroup(1, this.lightClustersBindGroup);
        computePass.setPipeline(this.lightClustersPipeline);
        let clusterWorkgroupCount = Math.ceil(this.clusterNum / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(clusterWorkgroupCount);

        }

        computePass.end();
        // finish encoding and submit the commands
        device.queue.submit([encoder.finish()]);

        
    }
}
