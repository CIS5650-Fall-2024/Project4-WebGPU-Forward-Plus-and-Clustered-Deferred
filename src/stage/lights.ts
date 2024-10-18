import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

import * as renderer from '../renderer';

export var ifStop:boolean = false;
export var fixedTime:number = 0;

var prevFrameTime: number = 0;

export function stopTime(value: boolean) {
    ifStop = value;
    fixedTime = prevFrameTime;
}

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

var computeBound = true;
export function setComputeBound(flag: boolean) {
    computeBound = flag;
}
export class Lights {
    private camera: Camera;

    numLights = 50;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    clusterComputeBindGroupLayout: GPUBindGroupLayout;
    clusterComputeBindGroup: GPUBindGroup;

    clusterLightComputePipeline: GPUComputePipeline;
    clusterBoundComputePipeline: GPUComputePipeline;

    clusterBoundBuffer: GPUBuffer; 
    clusterLightsBuffer: GPUBuffer;

    zeroClusterLightsArray:Uint8Array;
    zeroGpuBuffer = device.createBuffer({
        size: 4096, // samll zero buffer in gpu
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here

    constructor(camera: Camera) {
        const zeroArray = new Uint8Array(this.zeroGpuBuffer.getMappedRange());
        zeroArray.fill(0);
        this.zeroGpuBuffer.unmap();

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

        var tileSize = shaders.constants.clusterSize[0] * shaders.constants.clusterSize[1] * shaders.constants.clusterSize[2];

        this.clusterBoundBuffer = device.createBuffer({
            label: "cluster bounds buffer",
            size: Math.floor(tileSize * shaders.constants.clusterBoundByteSize), 
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.clusterLightsBuffer = device.createBuffer({
            label: "cluster lights buffer",
            size: 4 + Math.floor(tileSize * shaders.constants.clusterLightByteSize) + 4 * Math.floor(tileSize * shaders.constants.clusterMaxLights), 
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.zeroClusterLightsArray = new Uint8Array(this.clusterLightsBuffer.size);
        this.zeroClusterLightsArray.fill(0);

        // cluster bound compute
        {
            // this.clusterBoundComputeBindGroupLayout = device.createBindGroupLayout({
            //     label: "cluster bound compute bind group layout",
            //     entries: [
            //         { // camera
            //             binding: 0,
            //             visibility: GPUShaderStage.COMPUTE,
            //             buffer: { type: "uniform" }
            //         },
            //         { // storage buffer(for cluster information)
            //             binding: 1,
            //             visibility: GPUShaderStage.COMPUTE,
            //             buffer: { type: "storage" }
            //         }
            //     ]
            // });

            // this.clusterBoundComputeBindGroup = device.createBindGroup({
            //     label: "cluster bound compute bind group",
            //     layout: this.clusterBoundComputeBindGroupLayout,
            //     entries: [
            //         {
            //             binding: 0,
            //             resource: { buffer: this.camera.uniformsBuffer }
            //         },
            //         {
            //             binding: 1,
            //             resource: { buffer: this.clusterBoundBuffer }
            //         }
            //     ]
            // });

            this.clusterComputeBindGroupLayout = device.createBindGroupLayout({
                label: "cluster compute bind group layout",
                entries: [
                    { // projection buffer
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    },
                    { // view buffer
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    },
                    { // lightSet
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "read-only-storage" }
                    },
                    { // cluster bounds
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" }
                    },
                    { // cluster lights
                        binding: 4,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" }
                    }
                ]
            });

            this.clusterComputeBindGroup = device.createBindGroup({
                label: "cluster compute bind group",
                layout: this.clusterComputeBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.camera.uniformsBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.camera.viewUniformBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.lightSetStorageBuffer }
                    },
                    {
                        binding: 3,
                        resource: { buffer: this.clusterBoundBuffer   }
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.clusterLightsBuffer }
                    }
                ]
            });

            this.clusterBoundComputePipeline = device.createComputePipeline({
                label: "cluster bound compute pipeline",
                layout: device.createPipelineLayout({
                    label: "cluster bound compute pipeline layout",
                    bindGroupLayouts: [ this.clusterComputeBindGroupLayout ]
                }),
                compute: {
                    module: device.createShaderModule({
                        label: "cluster bound compute shader",
                        code: shaders.clusterBoundComputeSrc
                    }),
                    entryPoint: "main"
                }
            });
        }

        // clustering compute
        {
            this.clusterLightComputePipeline = device.createComputePipeline({
                label: "cluster lights compute pipeline",
                layout: device.createPipelineLayout({
                    label: "cluster lights compute pipeline layout",
                    bindGroupLayouts: [ this.clusterComputeBindGroupLayout ]
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

        // cluster bounds compute
        if(computeBound)
        {
            computeBound = false;
            const clusterBoundsComputePass = encoder.beginComputePass();
            clusterBoundsComputePass.setPipeline(this.clusterBoundComputePipeline);
            clusterBoundsComputePass.setBindGroup(0, this.clusterComputeBindGroup);
            clusterBoundsComputePass.dispatchWorkgroups(8, 9, 12);
            clusterBoundsComputePass.end();
        }

        // clustering compute
        {
            // clear the light buffer

            // cpu->gpu copy is really slow
            //device.queue.writeBuffer(this.clusterLightsBuffer, 0, this.zeroClusterLightsArray);

            // gpu->gpu copy is fast, so we can use it to clear the buffer
            let offset = 0;
            while (offset < this.clusterLightsBuffer.size) {
                const copySize = Math.min(4096, this.clusterLightsBuffer.size - offset);
                encoder.copyBufferToBuffer(this.zeroGpuBuffer, 0, this.clusterLightsBuffer, offset, copySize);
                offset += copySize;
            }
            
            const clusterLightsComputePass = encoder.beginComputePass();
            clusterLightsComputePass.setPipeline(this.clusterLightComputePipeline);
            clusterLightsComputePass.setBindGroup(0, this.clusterComputeBindGroup);
            clusterLightsComputePass.dispatchWorkgroups(8, 9, 12);
            clusterLightsComputePass.end();
        }
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        prevFrameTime = time;
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([ifStop ? fixedTime : time]));

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
