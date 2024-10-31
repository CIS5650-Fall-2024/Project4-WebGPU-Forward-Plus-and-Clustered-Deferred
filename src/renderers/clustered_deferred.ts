import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    fullScreenTextureUniformsBindGroupLayout: GPUBindGroupLayout;
    fullScreenTextureUniformsBindGroup: GPUBindGroup;
    
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    canvasResolutionUniformBuffer: GPUBuffer;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // uniforms
        this.canvasResolutionUniformBuffer = renderer.device.createBuffer({
            size: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats: width and height
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: "canvas resolution uniform buffer",
        });

        // textures
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.colorTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.colorTextureView = this.colorTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        // scene uniforms bind group layout
        // contains camera uniforms, lightSet, and clusterSet
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gBuffer uniforms bind group layout",
            entries: [
                { // camera viewProjMat
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                // { // canvas resolution
                //     binding: 1,
                //     visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                //     buffer: { type: "uniform" }
                // },
                { // camera inverse projection matrix
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // camera inverse view matrix
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
        
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "gBuffer uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                // {
                //     binding: 1,
                //     resource: { buffer: this.canvasResolutionUniformBuffer }
                // },
                {
                    binding: 1,
                    resource: { buffer: this.camera.uniformsInverseProjBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsInverseViewBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        // Fullscreen uniforms bind group layout
        this.fullScreenTextureUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "fullScreen uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'depth' }
                }
            ]
        });

        this.fullScreenTextureUniformsBindGroup = renderer.device.createBindGroup({
            label: "fullScreen uniforms bind group",
            layout: this.fullScreenTextureUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.colorTextureView
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.depthTextureView
                }
            ]
        });

        // G-buffer pass, render color and normal textures
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "scene pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "scene vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "scene frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: this.colorTexture.format },
                    { format: this.normalTexture.format }
                ]
            }
        });

        // Fullscreen pass, render lighting pass
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.fullScreenTextureUniformsBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    updateCanvasResolutionBuffer() {
        const resolutionData = new Float32Array([
            renderer.canvas.width,
            renderer.canvas.height
        ]);

        renderer.device.queue.writeBuffer(
            this.canvasResolutionUniformBuffer,
            0,
            resolutionData.buffer
        );
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.updateCanvasResolutionBuffer();
        this.lights.doLightClustering(encoder);

        const gBufferRenderPass = encoder.beginRenderPass({
            label: "gBuffer render pass",
            colorAttachments: [
                { 
                    view: this.colorTextureView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", 
                    storeOp: "store" },
                { 
                    view: this.normalTextureView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", 
                    storeOp: "store" 
                }
            ],
            depthStencilAttachment: { 
                view: this.depthTextureView, 
                depthClearValue: 1.0, 
                depthLoadOp: "clear", 
                depthStoreOp: "store" 
            }
        });
        gBufferRenderPass.setPipeline(this.gBufferPipeline);
        gBufferRenderPass.setBindGroup(
            shaders.constants.bindGroup_scene, 
            this.sceneUniformsBindGroup
        );

        this.scene.iterate(node => {
            gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferRenderPass.drawIndexed(primitive.numIndices);
        });
        gBufferRenderPass.end();

        const fullscreenRenderPass = encoder.beginRenderPass({
            label: "fullscreen render pass",
            colorAttachments: [
                { 
                    view: canvasTextureView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", 
                    storeOp: "store" 
                }
            ]
        });
        fullscreenRenderPass.setPipeline(this.fullscreenPipeline);
        fullscreenRenderPass.setBindGroup(0, this.sceneUniformsBindGroup);
        fullscreenRenderPass.setBindGroup(1, this.fullScreenTextureUniformsBindGroup);
        fullscreenRenderPass.draw(3);
        fullscreenRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
