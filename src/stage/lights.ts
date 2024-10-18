import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

interface ClusterSetViews {
    numClusters: number;
    clusters: Array<ClusterView>;
}

interface ClusterView {
    minPoint: Float32Array;
    maxPoint: Float32Array;
    numLights: number;
    lightIndices: Uint32Array;
}

class ClusterSet {
    static readonly numLightIndices = shaders.constants.numLightIndices;       // total number of lights per cluster
    static readonly clusterByteSize = 4048;       // cluster byte size

    numClusters: number;
    byteSize : number; 

    clusterSetStorageBuffer: GPUBuffer; // Contains Data (Device Side)
    clusterSetResultBuffer: GPUBuffer; // CPU-Mappable Buffer

    constructor(numClusters: number) {
        this.numClusters = numClusters;
        this.byteSize = 16 + (this.numClusters * ClusterSet.clusterByteSize); 

        // storage buffer for computer shader
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "ClusterSet Storage Buffer",
            size: this.byteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        }); 

        // mappable staging buffer to map to CPU side (for debugging purposes)
        this.clusterSetResultBuffer = device.createBuffer({
            label: "ClusterSet Result Buffer",
            size: this.byteSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        })
    }

    copyResult(encoder: GPUCommandEncoder) {
        encoder.copyBufferToBuffer(
            this.clusterSetStorageBuffer, 
            0, 
            this.clusterSetResultBuffer, 
            0, 
            this.byteSize
        ); 
    }

    async mapResult() : Promise<ClusterSetViews> {
        if (this.clusterSetResultBuffer.mapState === "mapped" || this.clusterSetResultBuffer.mapState === "pending") {
            throw new Error("Buffer is unable to be mapped."); 
        }

        await this.clusterSetResultBuffer.mapAsync(GPUMapMode.READ); 

        const mappedBuffer : ArrayBuffer = this.clusterSetResultBuffer.getMappedRange(); 
        
        const clusters = new Array<ClusterView>;
        for (let i = 0; i < this.numClusters; i++) {
            let offset = i * ClusterSet.clusterByteSize; 
            clusters.push({
                minPoint: new Float32Array(mappedBuffer, offset + 16, 4),
                maxPoint: new Float32Array(mappedBuffer, offset + 32, 4),
                numLights: (new Uint32Array(mappedBuffer, offset + 48, 1))[0],
                lightIndices: new Uint32Array(mappedBuffer, offset + 52, ClusterSet.numLightIndices)
            });
        };

        const clusterSetView = {
            numClusters: new Uint32Array(mappedBuffer, 0, 1)[0],
            clusters: clusters
        };

        return clusterSetView;
    }

    unMapResult() {
        this.clusterSetResultBuffer.unmap(); 
    }
}

export class Lights {
    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    clusterSet: ClusterSet; 

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    lightClusteringBindGroupLayout: GPUBindGroupLayout;
    lightClusteringComputeBindGroup: GPUBindGroup;
    lightClusteringComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        // -- Move Light Compute Pipeline Setup --

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // populate the light set storage buffer
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
                bindGroupLayouts: [this.moveLightsComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });


        // -- Light Cluster Compute Pipeline Setup --

        this.clusterSet = new ClusterSet(
            shaders.constants.clusterSize[0] * shaders.constants.clusterSize[1] * shaders.constants.clusterSize[2]
        ); 

        // create bind group layout
        this.lightClusteringBindGroupLayout = device.createBindGroupLayout(
            {
                label: "light cluster compute bind group layout",
                entries: [
                    { // lightSet
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "read-only-storage" }
                    },
                    { // clusterSet
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" }
                    },
                    { // cameraUniforms
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    }
                ]
            }
        );

        // create bind group
        this.lightClusteringComputeBindGroup = device.createBindGroup({
            label: "light cluster compute bind group",
            layout: this.lightClusteringBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.clusterSet.clusterSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsGPUBuffer }
                }
            ]
        });

        // create pipeline
        this.lightClusteringComputePipeline = device.createComputePipeline({
            label: "cluster lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "cluster lights compute pipeline layout",
                bindGroupLayouts: [this.lightClusteringBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "cluster lights compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // set light color
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
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.lightClusteringComputePipeline);
        computePass.setBindGroup(0, this.lightClusteringComputeBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(shaders.constants.clusterSize[0] / shaders.constants.clusterWorkgroupSize[0]),
            Math.ceil(shaders.constants.clusterSize[1] / shaders.constants.clusterWorkgroupSize[1]),
            Math.ceil(shaders.constants.clusterSize[2] / shaders.constants.clusterWorkgroupSize[2])
        );
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

        device.queue.submit([encoder.finish()]);
    }
}
