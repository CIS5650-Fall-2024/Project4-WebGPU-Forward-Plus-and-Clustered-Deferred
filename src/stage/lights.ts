import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights = 100;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here

    numClusters = 10 * 10 * 10;
    clustersDim = new Uint32Array([10,10,10]);

    static readonly maxNumClusters = shaders.constants.maxNumberClusters;
    static readonly numFloatsPerCluster = 16 + 16 + 16 + shaders.constants.maxLightsPerCluster * 4; //minBound (12) + maxBound (12) + numLights (4) + lightArray (16 * 4)

    clustersArray = new Float32Array(Lights.maxNumClusters * Lights.numFloatsPerCluster);
    clusterSetStorageBuffer: GPUBuffer;

    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

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
                bindGroupLayouts: [ this.moveLightsComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
        // I need to send cameraUniforms, lightSet and clusterSet to the clustering.cs.wgsl compute shaders!

        // struct ClusterSet {
        //     clustersDim: vec3u,
        //     numClusters: u32,
        //     clusters: array<Cluster, ${maxNumberClusters}>
        // }
        
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "clusters",
            size: 16 + this.clustersArray.byteLength, //12 for clustersDim (12), 4 for padding, 4 for numClusters (4) and 12 for padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });

        // //TODONOW2 Populate clusters Buffer! ? .. I guess I don't actually need any values
        this.updateClusterSetUniformClustersDim();

        this.updateClusterSetUniformNumClusters();

        this.clusteringComputeBindGroupLayout = device.createBindGroupLayout({
            label: "initialize clusters and assign lights compute bind group layout",
            entries: [
                {
                    // clusterSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage"}
                },
                {
                    //lightset
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage"}
                },
                {
                    //cameraUniforms
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform"}
                }
            ]
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "clustering compute bind group",
            layout: this.clusteringComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "clustering compute pipeline layout",
                bindGroupLayouts: [ this.clusteringComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    updateClusterSetUniformClustersDim() {
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, this.clustersDim);
    }

    updateClusterSetUniformNumClusters() {
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 12, new Uint32Array([this.numClusters]));
        // const message: string = "numClusters";
        // console.log(message);
        // console.log(this.numClusters);
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        // const computePass
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusteringComputePipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusteringComputeBindGroup);
        const workgroupCount = Math.ceil(this.numClusters / shaders.constants.clusteringWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);
        computePass.end();
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        // TODONOW2
        // this.doLightClustering(encoder);
        //
        device.queue.submit([encoder.finish()]);
    }
}
