import * as renderer from "../renderer";
import * as shaders from "../shaders/shaders";
import { Stage } from "../stage/stage";

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    depthTextureSampler: GPUSampler;

    pipeline: GPURenderPipeline;

    // light culling
    numTilesX: number;
    numTilesY: number;
    numTilesZ: number;
    resUniformBuffer: GPUBuffer;
    tileUniformBuffer: GPUBuffer;
    pipelinePrez: GPURenderPipeline;

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

    constructor(stage: Stage) {
        super(stage);

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

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthTextureView = this.depthTexture.createView();

        this.depthTextureSampler = renderer.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        // prez pass
        this.pipelinePrez = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward plus prez pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward plus vert shader",
                    code: shaders.forwardPlusVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus prez frag shader",
                    code: shaders.forwardPlusPassthroughSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
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
            label: "forward plus light bounding box pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward plus light bounding box pipeline layout",
                bindGroupLayouts: [this.bboxBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "forward plus light bounding box shader",
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
            label: "forward plus light cull pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward plus light cull pipeline layout",
                bindGroupLayouts: [this.lightCullBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "forward plus light cull shader",
                    code: shaders.forwardPlusLightcullSrc,
                }),
                entryPoint: "computeMain",
            },
        });

        // debug
        this.sceneLightsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "debug bind group layout",
            entries: [
                {
                    // resolution
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "depth",
                    },
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
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
                {
                    binding: 4,
                    resource: this.depthTextureView,
                },
                {
                    binding: 5,
                    resource: this.depthTextureSampler,
                },
            ],
        });

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward plus pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                    this.sceneLightsBindGroupLayout,
                ],
            }),
            // depthStencil: {
            //     depthWriteEnabled: true,
            //     depthCompare: "less",
            //     format: "depth24plus",
            // },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward plus vert shader",
                    code: shaders.forwardPlusVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // prez pass
        const renderPassPrez = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        renderPassPrez.setPipeline(this.pipelinePrez);
        renderPassPrez.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(
            (node) => {
                renderPassPrez.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            (material) => {
                renderPassPrez.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            (primitive) => {
                renderPassPrez.setVertexBuffer(0, primitive.vertexBuffer);
                renderPassPrez.setIndexBuffer(primitive.indexBuffer, "uint32");
                renderPassPrez.drawIndexed(primitive.numIndices);
            }
        );
        renderPassPrez.end();

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

        // render pass
        const renderPass = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            // depthStencilAttachment: {
            //     view: this.depthTextureView,
            //     depthClearValue: 1.0,
            //     depthLoadOp: "load",
            //     depthStoreOp: "store",
            // },
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(shaders.constants.bindGroup_lightcull, this.sceneLightsBindGroup);

        this.scene.iterate(
            (node) => {
                renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            (material) => {
                renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            (primitive) => {
                renderPass.setVertexBuffer(0, primitive.vertexBuffer);
                renderPass.setIndexBuffer(primitive.indexBuffer, "uint32");
                renderPass.drawIndexed(primitive.numIndices);
            }
        );
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
