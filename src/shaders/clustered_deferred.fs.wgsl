// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3<f32>, // World space position
    @location(1) nor: vec3<f32>, // Normal in world space
    @location(2) uv: vec2<f32>,  // Texture coordinates
   
};

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,    
    @location(1) normal: vec4<f32>,   
    @location(2) depth: f32,           
};

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    var output: GBufferOutput;


    let normalizedNormal = normalize(in.nor);
    output.normal = vec4<f32>(normalizedNormal, 1.0); // Assuming roughness = 1.0 for now

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f){
        discard;
    }
    output.albedo = diffuseColor; 
    output.depth = in.pos.z; 
    return output;
}