import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    
    // declare the bind group layout for the scene
    scene_bind_group_layout: GPUBindGroupLayout;
    
    // declare the bind group for the scene
    scene_bind_group: GPUBindGroup;
    
    // declare the depth texture
    depth_texture: GPUTexture;
    
    // declare the depth texture view
    depth_texture_view: GPUTextureView;
    
    // declare the render pipeline layout
    render_pipeline_layout: GPUPipelineLayout;
    
    // declare the render pipeline vertex shader module
    render_pipeline_vertex_shader_module: GPUShaderModule;
    
    // declare the render pipeline fragment shader module
    render_pipeline_fragment_shader_module: GPUShaderModule;
    
    // declare the render pipeline
    render_pipeline: GPURenderPipeline;
    
    constructor(stage: Stage) {
        super(stage);
        
        // create the bind group layout for the scene
        this.scene_bind_group_layout = renderer.device.createBindGroupLayout({
            label: "scene_bind_group_layout",
            entries: [
                
                // create a new bind group layout entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the shader stage to be the vertex and fragment shader
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    
                    // specify the buffer type to be uniform
                    buffer: {
                        type: "uniform",
                    },
                },
                
                // create a new bind group layout entry for the light buffer
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the shader stage to be the fragment shader
                    visibility: GPUShaderStage.FRAGMENT,
                    
                    // specify the buffer type to be read-only storage
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });
        
        // create the bind group for the scene
        this.scene_bind_group = renderer.device.createBindGroup({
            label: "scene_bind_group",
            layout: this.scene_bind_group_layout,
            entries: [
                
                // create a new bind group entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the resource to be the camera's uniform buffer
                    resource: {
                        buffer: this.camera.uniformsBuffer,
                    },
                },
                
                // create a new bind group entry for the light buffer
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the resource to be the light buffer
                    resource: {
                        buffer: this.lights.lightSetStorageBuffer,
                    },
                },
            ],
        });
        
        // create the depth texture
        this.depth_texture = renderer.device.createTexture({
            label: "depth_texture",
            size: [
                renderer.canvas.width,
                renderer.canvas.height,
            ],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        
        // create the depth texture view
        this.depth_texture_view = this.depth_texture.createView();
        
        // create the render pipeline layout
        this.render_pipeline_layout = renderer.device.createPipelineLayout({
            label: "render_pipeline_layout",
            bindGroupLayouts: [
                this.scene_bind_group_layout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout,
                this.lights.cluster_bind_group_layout,
            ],
        });
        
        // declare the render pipeline vertex shader module
        this.render_pipeline_vertex_shader_module = renderer.device.createShaderModule({
            label: "render_pipeline_vertex_shader_module",
            code: shaders.naiveVertSrc,
        });
        
        // declare the render pipeline fragment shader module
        this.render_pipeline_fragment_shader_module = renderer.device.createShaderModule({
            label: "render_pipeline_fragment_shader_module",
            code: shaders.forwardPlusFragSrc,
        });
        
        // create the render pipeline
        this.render_pipeline = renderer.device.createRenderPipeline({
            label: "render_pipeline",
            layout: this.render_pipeline_layout,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: this.render_pipeline_vertex_shader_module,
                buffers: [
                    renderer.vertexBufferLayout,
                ],
            },
            fragment: {
                module: this.render_pipeline_fragment_shader_module,
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        
        // create a new command encoder
        const encoder = renderer.device.createCommandEncoder();
        
        // execute the compute shader
        this.lights.compute(encoder);
        
        // create the attachment view where the scene is rendered
        const attachment_view = renderer.context.getCurrentTexture().createView();
        
        // create and start the render pass
        const render_pass = encoder.beginRenderPass({
            label: "render_pass",
            colorAttachments: [
                {
                    view: attachment_view,
                    clearValue: [
                        0,
                        0,
                        0,
                        0,
                    ],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depth_texture_view,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        
        // bind the render pipeline
        render_pass.setPipeline(this.render_pipeline);
        
        // bind the scene's bind group to the render pass
        render_pass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.scene_bind_group
        );
        
        // bind the clusters' bind group to the render pass
        render_pass.setBindGroup(
            shaders.constants.bindGroup_cluster,
            this.lights.cluster_bind_group
        );
        
        // bind additional shader resources and render
        this.scene.iterate(node => {
            
            // bind the model matrices
            render_pass.setBindGroup(
                shaders.constants.bindGroup_model,
                node.modelBindGroup
            );
        }, material => {
            
            // bind the textures and samplers
            render_pass.setBindGroup(
                shaders.constants.bindGroup_material,
                material.materialBindGroup
            );
        }, primitive => {
            
            // bind the vertex buffer
            render_pass.setVertexBuffer(
                0, primitive.vertexBuffer
            );
            
            // bind the index buffer
            render_pass.setIndexBuffer(
                primitive.indexBuffer, "uint32"
            );
            
            // render the primitive
            render_pass.drawIndexed(
                primitive.numIndices
            );
        });
        
        // end the render pass
        render_pass.end();
        
        // submit the encoded commands
        renderer.device.queue.submit([
            encoder.finish(),
        ]);
    }
}
