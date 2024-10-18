import { Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { setComputeBound } from './stage/lights';
import { GUIController } from 'dat.gui';

import * as shaders from './shaders/shaders';

export var canvas: HTMLCanvasElement;
export var canvasFormat: GPUTextureFormat;
export var context: GPUCanvasContext;
export var device: GPUDevice;
export var canvasTextureView: GPUTextureView;

export var aspectRatio: number;
export const fovYDegrees = 45;

export var modelBindGroupLayout: GPUBindGroupLayout;
export var materialBindGroupLayout: GPUBindGroupLayout;

export var useBloom: boolean = false;
export var useRenderBundles: boolean = false;
export var useGbufferCompression: boolean = false;

export function setBloom(value:boolean)
{
    useBloom = value;
    // console.log('Bloom is now ' + (useBloom ? 'enabled' : 'disabled'));
}

export function setRenderBundles(value:boolean)
{
    useRenderBundles = value;
    console.log('Render Bundles is now ' + (useRenderBundles ? 'enabled' : 'disabled'));
}

export function setGbufferCompression(value:boolean)
{
    useGbufferCompression = value;
    console.log('Gbuffer Compression is now ' + (useGbufferCompression ? 'enabled' : 'disabled'));
}

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    aspectRatio = canvas.width / canvas.height;

    if (!navigator.gpu)
    {
        let errorMessageElement = document.createElement("h1");
        errorMessageElement.textContent = "This browser doesn't support WebGPU! Try using Google Chrome.";
        errorMessageElement.style.paddingLeft = '0.4em';
        document.body.innerHTML = '';
        document.body.appendChild(errorMessageElement);
        throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
    {
        throw new Error("no appropriate GPUAdapter found");
    }

    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu")!;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    console.log("WebGPU init successsful");

    modelBindGroupLayout = device.createBindGroupLayout({
        label: "model bind group layout",
        entries: [
            { // modelMat
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }
        ]
    });

    materialBindGroupLayout = device.createBindGroupLayout({
        label: "material bind group layout",
        entries: [
            { // diffuseTex
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            { // diffuseTexSampler
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }
        ]
    });
}

export const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        { // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0
        },
        { // nor
            format: "float32x3",
            offset: 12,
            shaderLocation: 1
        },
        { // uv
            format: "float32x2",
            offset: 24,
            shaderLocation: 2
        }
    ]
};

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;

    // Post Processing
    protected postProcessBloomBindGroupLayout: GPUBindGroupLayout;
    protected postProcessBloomBindGroup1: GPUBindGroup;
    protected postProcessBloomBindGroup2: GPUBindGroup;
    protected postProcessBloomExtractBrightnessPipeline: GPUComputePipeline;
    protected postProcessBloomBlurPipeline: GPUComputePipeline;
    protected postProcessBloomGaussianBlurPipeline: GPUComputePipeline;

    protected postProcessBloomCompositePipeline: GPURenderPipeline;
    protected debugCopyPipeline: GPURenderPipeline;

    protected screenTexture: GPUTexture;
    protected screenTextureView: GPUTextureView;

    protected postProcessBloomInTexture: GPUTexture;
    protected postProcessBloomInTextureView: GPUTextureView;
    protected postProcessBloomBrightnessTexture: GPUTexture;
    protected postProcessBloomBrightnessTextureView: GPUTextureView;
    protected postProcessBloomBlurTexture: GPUTexture;
    protected postProcessBloomBlurTextureView: GPUTextureView;
    protected postProcessBloomOutTexture: GPUTexture;
    protected postProcessBloomOutTextureView: GPUTextureView;

    protected debugCopyTexture: GPUTexture;
    protected debugCopyTextureView: GPUTextureView;

    protected debugCopyTexture2: GPUTexture;
    protected debugCopyTextureView2: GPUTextureView;

    protected blurDirectionBuffer: GPUBuffer;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));

        // Post Processing

        // Create Buffers
        {
            this.blurDirectionBuffer = device.createBuffer({
                size: 4,  // Size of a u32 is 4 bytes
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
              });
        }

        // Create Textures
        {
            this.postProcessBloomInTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: "r32float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
            });
            this.postProcessBloomInTextureView = this.postProcessBloomInTexture.createView();

            this.postProcessBloomBrightnessTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: "r32float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
            });
            this.postProcessBloomBrightnessTextureView = this.postProcessBloomBrightnessTexture.createView();

            this.postProcessBloomBlurTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: "r32float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
            });
            this.postProcessBloomBlurTextureView = this.postProcessBloomBlurTexture.createView();

            this.postProcessBloomOutTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: "r32float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this.postProcessBloomOutTextureView = this.postProcessBloomOutTexture.createView();

            this.screenTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: canvasFormat,
                usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
              });
            this.screenTextureView = this.screenTexture.createView();

            this.debugCopyTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: canvasFormat,
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this.debugCopyTextureView = this.debugCopyTexture.createView();

            this.debugCopyTexture2 = device.createTexture({
                size: [canvas.width, canvas.height],
                format: canvasFormat,
                usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this.debugCopyTextureView2 = this.debugCopyTexture2.createView();
        }

        // Create Layouts
        {
            this.postProcessBloomBindGroupLayout = device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float",
                            viewDimension: '2d'
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                        storageTexture: {
                            access: 'read-write',  
                            format: 'r32float'  
                        }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                        storageTexture: {
                            access: 'read-write',  
                            format: 'r32float'  
                        }
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: {
                            access: 'read-write',  
                            format: 'r32float'  
                        }
                    },
                    {   // blur direction
                        binding: 4,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    }
                ]
            });

            this.postProcessBloomBindGroup1 = device.createBindGroup({
                layout: this.postProcessBloomBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.screenTextureView
                    },
                    {
                        binding: 1,
                        resource: this.postProcessBloomBrightnessTextureView
                    },
                    {
                        binding: 2,
                        resource: this.postProcessBloomBlurTextureView
                    },
                    {
                        binding: 3,
                        resource: this.postProcessBloomOutTextureView
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.blurDirectionBuffer }
                    },
                ]
            });

            this.postProcessBloomBindGroup2 = device.createBindGroup({
                layout: this.postProcessBloomBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.screenTextureView
                    },
                    {
                        binding: 1,
                        resource: this.postProcessBloomBlurTextureView
                    },
                    {
                        binding: 2,
                        resource: this.postProcessBloomBrightnessTextureView
                    },
                    {
                        binding: 3,
                        resource: this.postProcessBloomOutTextureView
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.blurDirectionBuffer }
                    },
                ]
            });
        }

        // Create Pipelines
        {
            this.postProcessBloomExtractBrightnessPipeline = device.createComputePipeline({
                label: "bloom brightness extraction compute pipeline",
                layout: device.createPipelineLayout({
                    label: "bloom brightness extraction compute pipeline layout",
                    bindGroupLayouts: [ this.postProcessBloomBindGroupLayout ]
                }),
                compute: {
                    module: device.createShaderModule({
                        label: "bloom brightness extraction compute shader",
                        code: shaders.bloomExtractBrightnessComputeSrc
                    }),
                    entryPoint: "main"
                }
            });

            this.postProcessBloomBlurPipeline = device.createComputePipeline({
                label: "bloom blur compute pipeline",
                layout: device.createPipelineLayout({
                    label: "bloom blur compute pipeline layout",
                    bindGroupLayouts: [ this.postProcessBloomBindGroupLayout ]
                }),
                compute: {
                    module: device.createShaderModule({
                        label: "bloom blur compute shader",
                        code: shaders.bloomBlurBoxComputeSrc
                    }),
                    entryPoint: "main"
                }
            });

            this.postProcessBloomGaussianBlurPipeline = device.createComputePipeline({
                label: "bloom gaussian blur compute pipeline",
                layout: device.createPipelineLayout({
                    label: "bloom gaussian blur compute pipeline layout",
                    bindGroupLayouts: [ this.postProcessBloomBindGroupLayout ]
                }),
                compute: {
                    module: device.createShaderModule({
                        label: "bloom gaussian blur compute shader",
                        code: shaders.bloomBlurGaussianComputeSrc
                    }),
                    entryPoint: "main"
                }
            });

            this.postProcessBloomCompositePipeline = device.createRenderPipeline({
                label: "bloom composite render pipeline",
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [ this.postProcessBloomBindGroupLayout ]
                }),
                vertex: {
                    module: device.createShaderModule({
                        code: shaders.bloomCopyVertSrc
                    }),
                },
                fragment: {
                    module: device.createShaderModule({
                        code: shaders.bloomCompositeFragSrc
                    }),
                    targets: [
                        {
                            format: canvasFormat
                        }
                    ]
                }
            });

            this.debugCopyPipeline = device.createRenderPipeline({
                label: "bloom debug copy pipeline",
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [ this.postProcessBloomBindGroupLayout ]
                }),
                vertex: {
                    module: device.createShaderModule({
                        code: shaders.bloomCopyVertSrc
                    }),
                },
                fragment: {
                    module: device.createShaderModule({
                        code: shaders.bloomCopyFragSrc
                    }),
                    targets: [
                        {
                            format: canvasFormat
                        },
                        {
                            format: canvasFormat
                        }
                    ]
                }
            });
        }
    }

    canvasBloom(encoder: GPUCommandEncoder)
    {
        let gridSize = [Math.floor((canvas.width + shaders.constants.bloomKernelSize[0] - 1) / shaders.constants.bloomKernelSize[0]), 
                        Math.floor((canvas.height + shaders.constants.bloomKernelSize[1] - 1) / shaders.constants.bloomKernelSize[1])];
        // 1. Brightness Extraction
        {
            const bloomBrightnessExtractionPass = encoder.beginComputePass();
            bloomBrightnessExtractionPass.setPipeline(this.postProcessBloomExtractBrightnessPipeline);
            bloomBrightnessExtractionPass.setBindGroup(0, this.postProcessBloomBindGroup1);
            bloomBrightnessExtractionPass.dispatchWorkgroups(gridSize[0], gridSize[1]);
            bloomBrightnessExtractionPass.end();
        }

        // 2. Blur
        {
            let blurTimes = shaders.constants.bloomBlurTimes*2;
            const direction = new Uint32Array(1);
            for(var i = 0; i < blurTimes; i++)
            {
                direction[0] = i % 2;
                device.queue.writeBuffer(this.blurDirectionBuffer, 0, direction);

                const bloomBlurPass = encoder.beginComputePass();
                bloomBlurPass.setPipeline(this.postProcessBloomBlurPipeline);
                if(direction[0] == 0)
                {
                    bloomBlurPass.setBindGroup(0, this.postProcessBloomBindGroup1);
                }
                else
                {
                    bloomBlurPass.setBindGroup(0, this.postProcessBloomBindGroup2);
                }
                bloomBlurPass.dispatchWorkgroups(gridSize[0], gridSize[1]);
                bloomBlurPass.end();
            }
        }

        // 3. Composite
        {
            const bloomCompositeRenderPass = encoder.beginRenderPass({
                label: "bloom composite render pass",
                colorAttachments: [
                    {
                        view: context.getCurrentTexture().createView(),
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });
            bloomCompositeRenderPass.setPipeline(this.postProcessBloomCompositePipeline);
            bloomCompositeRenderPass.setBindGroup(0, this.postProcessBloomBindGroup1);
            bloomCompositeRenderPass.draw(3);
            bloomCompositeRenderPass.end();
        }

        // debug
        {
            const textureVisualPass = encoder.beginRenderPass({
                label: "bloom debug render pass",
                colorAttachments: [
                    {
                        view: this.debugCopyTextureView,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    },
                    {
                        view: this.debugCopyTextureView2,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });
            textureVisualPass.setPipeline(this.debugCopyPipeline);
            textureVisualPass.setBindGroup(0, this.postProcessBloomBindGroup1);
            textureVisualPass.draw(3);
            textureVisualPass.end();
        }
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        this.draw();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}

export function initResizeObserver(onResizeCallback: (param: any) => void, getRenderMode: () => string) {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            const devicePixelRatio = window.devicePixelRatio;
    
            canvas.width = width * devicePixelRatio;
            canvas.height = height * devicePixelRatio;
    
            aspectRatio = canvas.width / canvas.height;

            onResizeCallback(getRenderMode());
        }
    });

    resizeObserver.observe(canvas);
}