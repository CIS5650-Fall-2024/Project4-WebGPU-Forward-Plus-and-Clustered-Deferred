import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;


    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    clusterBindGroupLayout: GPUBindGroupLayout;
    clusterBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0
                // you can access the camera using `this.camera`
                // if you run into TypeScript errors, you're probably trying to upload the host buffer instead
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer}
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.clusterBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clusters fp bind group layout",
            entries: [
                { 
                    binding: 0, // clusters
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
        this.clusterBindGroup = renderer.device.createBindGroup({
            label: "cluster bind group",
            layout: this.clusterBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        /*
        this.clustersBindGroup = renderer.device.createBindGroup({
            label: "clusters bind group",
            layout: this.clustersBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.clusterArrayStorageBuffer}
                }
            ]
        });
        */

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "naive pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                    this.clusterBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "fp render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
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
        renderPass.setPipeline(this.pipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(shaders.constants.bindGroup_cluster, this.clusterBindGroup);

        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
