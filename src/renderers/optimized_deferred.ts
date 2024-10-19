import * as renderer from "../renderer";
import * as shaders from "../shaders/shaders";
import { Stage } from "../stage/stage";

const gaussianKernelSize = 5;
export class OptimizedDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    // G Buffers
    gbufferSampler: GPUSampler;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    unityTexture: GPUTexture;
    unityTextureView: GPUTextureView;
    // debugTexture: GPUTexture;
    // debugTextureView: GPUTextureView;

    // scene bind group with gbuffer

    // light culling
    numTilesX: number;
    numTilesY: number;
    numTilesZ: number;
    resUniformBuffer: GPUBuffer;
    tileUniformBuffer: GPUBuffer;
    pipelineGeometry: GPURenderPipeline;

    // light culling - bounding box
    clusterBuffer: GPUBuffer;
    bboxBindGroupLayout: GPUBindGroupLayout;
    bboxBindGroup: GPUBindGroup;
    pipelineBbox: GPUComputePipeline;

    // light culling - intersection
    tilesLightsIdxBuffer: GPUBuffer; // light index for each tile
    tilesLightsGridBuffer: GPUBuffer; // light offset and count for each tile
    lightCullBindGroupLayout: GPUBindGroupLayout;
    lightCullBindGroup: GPUBindGroup;
    pipelineLightCull: GPUComputePipeline;

    sceneLightsBindGroupLayout: GPUBindGroupLayout;
    sceneLightsBindGroup: GPUBindGroup;

    // full screen compute pass
    sceneComputeBindGroupLayout: GPUBindGroupLayout;
    pipelineFullscreenCompute: GPUComputePipeline;

    // bloom
    // bloomTexture: GPUTexture;
    // bloomTextureView: GPUTextureView;
    // gaussianKernel2D: GPUBuffer;
    // bloomBindGroupLayout: GPUBindGroupLayout;
    // pipelineBlur: GPUComputePipeline;

    // write back to canvas
    // writeBackBindGroupLayout: GPUBindGroupLayout;
    // pipelineWriteBack: GPUComputePipeline;

    getGaussian(x: number, y: number, sigma: number): number {
        return (1 / (2 * Math.PI * sigma * sigma)) * Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
    }

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
            ],
        });

        // gbuffer creation

        this.gbufferSampler = renderer.device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest",
        });

        // r: 0-15 bit for normal.x, 16-31 bit for normal.y
        // g: 0-15 bit for normal.z, 16-31 bit for depth
        // b: 0-7 bit for albedo.r, 8-15 bit for albedo.g, 16-23 bit for albedo.b, 24-31 bit for albedo.a
        this.unityTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.unityTextureView = this.unityTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthTextureView = this.depthTexture.createView();

        // this.debugTexture = renderer.device.createTexture({
        //     size: [renderer.canvas.width, renderer.canvas.height],
        //     format: "rgba16float",
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        // });
        // this.debugTextureView = this.debugTexture.createView();

        // this.bloomTexture = renderer.device.createTexture({
        //     size: [renderer.canvas.width, renderer.canvas.height],
        //     format: "rgba16float",
        //     usage:
        //         GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        // });
        // this.bloomTextureView = this.bloomTexture.createView();

        // full screen compute pass bind group
        this.sceneComputeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    // unity texture
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {
                        sampleType: "uint",
                        viewDimension: "2d",
                    },
                },
                {
                    // canvas framebuffer
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: renderer.canvasFormat,
                        viewDimension: "2d",
                    },
                },
                // {
                //     // bloom texture
                //     binding: 4,
                //     visibility: GPUShaderStage.COMPUTE,
                //     storageTexture: {
                //         access: "write-only",
                //         format: "rgba16float",
                //         viewDimension: "2d",
                //     },
                // },
            ],
        });

        // geometry pass
        this.pipelineGeometry = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred geometry pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred vert shader",
                    code: shaders.forwardPlusVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred prez frag shader",
                    code: shaders.optimizedDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba32uint",
                    },
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
        });

        // light culling
        this.resUniformBuffer = renderer.device.createBuffer({
            label: "tiles uniform buffer",
            size: 2 * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const resUniformBufferArray = new Uint32Array([renderer.canvas.width, renderer.canvas.height]);
        renderer.device.queue.writeBuffer(this.resUniformBuffer, 0, resUniformBufferArray);

        this.numTilesX = Math.ceil(renderer.canvas.width / shaders.constants.tileSize);
        this.numTilesY = Math.ceil(renderer.canvas.height / shaders.constants.tileSize);
        this.numTilesZ = shaders.constants.tileSizeZ;

        const numTiles = this.numTilesX * this.numTilesY * this.numTilesZ;
        const bufferSize = numTiles * Int32Array.BYTES_PER_ELEMENT;
        console.log("numTiles", numTiles);

        this.tileUniformBuffer = renderer.device.createBuffer({
            label: "tiles uniform buffer",
            size: 4 * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const tileUniformBufferArray = new Uint32Array([this.numTilesX, this.numTilesY, this.numTilesZ]);
        renderer.device.queue.writeBuffer(this.tileUniformBuffer, 0, tileUniformBufferArray);

        // assume each tile accept at most 10 lights
        this.tilesLightsIdxBuffer = renderer.device.createBuffer({
            label: "tiles lights idx buffer",
            size: bufferSize * shaders.constants.maxLightsPerTile,
            usage: GPUBufferUsage.STORAGE,
        });

        // light index offset and count for each tile
        this.tilesLightsGridBuffer = renderer.device.createBuffer({
            label: "tiles lights grid buffer",
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE,
        });

        this.clusterBuffer = renderer.device.createBuffer({
            label: "cluster buffer",
            size: numTiles * Float32Array.BYTES_PER_ELEMENT * 6, // 6 floats per cluster
            usage: GPUBufferUsage.STORAGE,
        });

        // light culling - tile per thread
        this.bboxBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "light cull bind group layout",
            entries: [
                {
                    // screen resolution
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    // camera view and inv view matrix
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ],
        });

        this.bboxBindGroup = renderer.device.createBindGroup({
            label: "light cull bind group",
            layout: this.bboxBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.resUniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.tileUniformBuffer },
                },
                {
                    binding: 3,
                    resource: { buffer: this.clusterBuffer },
                },
            ],
        });

        this.pipelineBbox = renderer.device.createComputePipeline({
            label: "optimized deferred light bounding box pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred light bounding box pipeline layout",
                bindGroupLayouts: [this.bboxBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred light bounding box shader",
                    code: shaders.forwardPlusBboxSrc,
                }),
                entryPoint: "computeMain",
            },
        });

        // light culling - intersection
        this.lightCullBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "light cull bind group layout",
            entries: [
                {
                    // screen resolution
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    // camera view and inv view matrix
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
                {
                    binding: 6,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ],
        });

        this.lightCullBindGroup = renderer.device.createBindGroup({
            label: "light cull bind group",
            layout: this.lightCullBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.resUniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.tileUniformBuffer },
                },
                {
                    binding: 3,
                    resource: { buffer: this.clusterBuffer },
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 5,
                    resource: { buffer: this.tilesLightsIdxBuffer },
                },
                {
                    binding: 6,
                    resource: { buffer: this.tilesLightsGridBuffer },
                },
            ],
        });

        this.pipelineLightCull = renderer.device.createComputePipeline({
            label: "optimized deferred light cull pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred light cull pipeline layout",
                bindGroupLayouts: [this.lightCullBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred light cull shader",
                    code: shaders.forwardPlusLightcullSrc,
                }),
                entryPoint: "computeMain",
            },
        });

        // shading
        this.sceneLightsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "debug bind group layout",
            entries: [
                {
                    // resolution
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });

        this.sceneLightsBindGroup = renderer.device.createBindGroup({
            label: "debug bind group",
            layout: this.sceneLightsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.resUniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.tileUniformBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.tilesLightsIdxBuffer },
                },
                {
                    binding: 3,
                    resource: { buffer: this.tilesLightsGridBuffer },
                },
            ],
        });

        this.pipelineFullscreenCompute = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.sceneComputeBindGroupLayout, this.sceneLightsBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    code: shaders.optimizedDeferredFullscreenComputeSrc,
                }),
                entryPoint: "computeMain",
            },
        });

        // // bloom
        // this.gaussianKernel2D = renderer.device.createBuffer({
        //     label: "gaussian kernel 2D",
        //     size: (gaussianKernelSize * 2 + 1) * Float32Array.BYTES_PER_ELEMENT,
        //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        // });

        // const gaussianKernel = new Float32Array(gaussianKernelSize * 2 + 1);
        // const mid = Math.floor(gaussianKernelSize / 2);
        // gaussianKernel[0] = gaussianKernelSize; // size
        // for (let i = 0; i < gaussianKernelSize; i++) {
        //     gaussianKernel[1 + i] = this.getGaussian(Math.abs(mid - i), 0, 1); // horizontal
        //     gaussianKernel[1 + i + gaussianKernelSize] = this.getGaussian(0, Math.abs(mid - i), 1); // vertical
        // }

        // renderer.device.queue.writeBuffer(this.gaussianKernel2D, 0, gaussianKernel);

        // this.bloomBindGroupLayout = renderer.device.createBindGroupLayout({
        //     entries: [
        //         {
        //             // canvas framebuffer
        //             binding: 0,
        //             visibility: GPUShaderStage.COMPUTE,
        //             storageTexture: {
        //                 access: "read-only",
        //                 format: renderer.canvasFormat,
        //                 viewDimension: "2d",
        //             },
        //         },
        //         {
        //             // bloom texture
        //             binding: 1,
        //             visibility: GPUShaderStage.COMPUTE,
        //             storageTexture: {
        //                 access: "write-only",
        //                 format: "rgba16float",
        //                 viewDimension: "2d",
        //             },
        //         },
        //         {
        //             binding: 2,
        //             visibility: GPUShaderStage.COMPUTE,
        //             buffer: { type: "read-only-storage" },
        //         },
        //         {
        //             binding: 3,
        //             visibility: GPUShaderStage.COMPUTE,
        //             buffer: { type: "uniform" },
        //         },
        //     ],
        // });

        // this.pipelineBlur = renderer.device.createComputePipeline({
        //     layout: renderer.device.createPipelineLayout({
        //         bindGroupLayouts: [this.bloomBindGroupLayout],
        //     }),
        //     compute: {
        //         module: renderer.device.createShaderModule({
        //             code: shaders.bloomComputeSrc,
        //         }),
        //         entryPoint: "computeMain",
        //     },
        // });

        // // write back
        // this.writeBackBindGroupLayout = renderer.device.createBindGroupLayout({
        //     entries: [
        //         {
        //             // canvas framebuffer
        //             binding: 0,
        //             visibility: GPUShaderStage.COMPUTE,
        //             storageTexture: {
        //                 access: "write-only",
        //                 format: renderer.canvasFormat,
        //                 viewDimension: "2d",
        //             },
        //         },
        //         {
        //             // bloom texture
        //             binding: 1,
        //             visibility: GPUShaderStage.COMPUTE,
        //             storageTexture: {
        //                 access: "read-only",
        //                 format: "rgba16float",
        //                 viewDimension: "2d",
        //             },
        //         },
        //         {
        //             binding: 2,
        //             visibility: GPUShaderStage.COMPUTE,
        //             buffer: { type: "read-only-storage" },
        //         },
        //         {
        //             // screen resolution
        //             binding: 3,
        //             visibility: GPUShaderStage.COMPUTE,
        //             buffer: { type: "uniform" },
        //         },
        //     ],
        // });

        // this.pipelineWriteBack = renderer.device.createComputePipeline({
        //     layout: renderer.device.createPipelineLayout({
        //         bindGroupLayouts: [this.writeBackBindGroupLayout],
        //     }),
        //     compute: {
        //         module: renderer.device.createShaderModule({
        //             code: shaders.bloomWriteBackComputeSrc,
        //         }),
        //         entryPoint: "computeMain",
        //     },
        // });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // const canvasTextureView = this.canvasTextureView;

        // geometry pass
        const renderPassGeometry = encoder.beginRenderPass({
            label: "optimized deferred render pass",
            colorAttachments: [
                {
                    view: this.unityTextureView,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        renderPassGeometry.setPipeline(this.pipelineGeometry);
        renderPassGeometry.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(
            (node) => {
                renderPassGeometry.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            (material) => {
                renderPassGeometry.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            (primitive) => {
                renderPassGeometry.setVertexBuffer(0, primitive.vertexBuffer);
                renderPassGeometry.setIndexBuffer(primitive.indexBuffer, "uint32");
                renderPassGeometry.drawIndexed(primitive.numIndices);
            }
        );
        renderPassGeometry.end();

        // light culling - bounding box
        const bboxPass = encoder.beginComputePass();
        bboxPass.setPipeline(this.pipelineBbox);
        bboxPass.setBindGroup(0, this.bboxBindGroup);
        bboxPass.dispatchWorkgroups(
            Math.ceil(this.numTilesX / shaders.constants.lightCullBlockSize),
            Math.ceil(this.numTilesY / shaders.constants.lightCullBlockSize),
            1
        );
        bboxPass.end();

        // light culling - intersection
        const lightCullPass = encoder.beginComputePass();
        lightCullPass.setPipeline(this.pipelineLightCull);
        lightCullPass.setBindGroup(0, this.lightCullBindGroup);
        lightCullPass.dispatchWorkgroups(
            Math.ceil(this.numTilesX / shaders.constants.lightCullBlockSize),
            Math.ceil(this.numTilesY / shaders.constants.lightCullBlockSize),
            this.numTilesZ
        );
        lightCullPass.end();

        // full screen compute pass
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.pipelineFullscreenCompute);
        const sceneComputeBindGroup = renderer.device.createBindGroup({
            layout: this.sceneComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: this.unityTextureView,
                },
                {
                    binding: 3,
                    resource: canvasTextureView,
                },
                // {
                //     binding: 4,
                //     resource: this.bloomTextureView,
                // },
            ],
        });
        computePass.setBindGroup(0, sceneComputeBindGroup);
        computePass.setBindGroup(1, this.sceneLightsBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / shaders.constants.lightCullBlockSize),
            Math.ceil(renderer.canvas.height / shaders.constants.lightCullBlockSize),
            1
        );
        computePass.end();

        // // bloom
        // const bloomPass = encoder.beginComputePass();
        // bloomPass.setPipeline(this.pipelineBlur);
        // const bloomBindGroup = renderer.device.createBindGroup({
        //     layout: this.bloomBindGroupLayout,
        //     entries: [
        //         {
        //             binding: 0,
        //             resource: canvasTextureView,
        //         },
        //         {
        //             binding: 1,
        //             resource: this.bloomTextureView,
        //         },
        //         {
        //             binding: 2,
        //             resource: { buffer: this.gaussianKernel2D },
        //         },
        //         {
        //             binding: 3,
        //             resource: { buffer: this.resUniformBuffer },
        //         },
        //     ],
        // });
        // bloomPass.setBindGroup(0, bloomBindGroup);
        // bloomPass.dispatchWorkgroups(
        //     Math.ceil(renderer.canvas.width / shaders.constants.lightCullBlockSize),
        //     Math.ceil(renderer.canvas.height / shaders.constants.lightCullBlockSize),
        //     1
        // );
        // bloomPass.end();

        // // write back
        // const writeBackPass = encoder.beginComputePass();
        // writeBackPass.setPipeline(this.pipelineWriteBack);
        // const writeBackBindGroup = renderer.device.createBindGroup({
        //     layout: this.writeBackBindGroupLayout,
        //     entries: [
        //         {
        //             binding: 0,
        //             resource: canvasTextureView,
        //         },
        //         {
        //             binding: 1,
        //             resource: this.bloomTextureView,
        //         },
        //         {
        //             binding: 2,
        //             resource: { buffer: this.gaussianKernel2D },
        //         },
        //         {
        //             binding: 3,
        //             resource: { buffer: this.resUniformBuffer },
        //         },
        //     ],
        // });
        // writeBackPass.setBindGroup(0, writeBackBindGroup);
        // writeBackPass.dispatchWorkgroups(
        //     Math.ceil(renderer.canvas.width / shaders.constants.lightCullBlockSize),
        //     Math.ceil(renderer.canvas.height / shaders.constants.lightCullBlockSize),
        //     1
        // );
        // writeBackPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
