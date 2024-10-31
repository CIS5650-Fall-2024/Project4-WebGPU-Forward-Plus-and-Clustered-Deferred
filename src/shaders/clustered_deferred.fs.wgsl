// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) color: vec4f,
    @location(1) normal: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    var output: GBufferOutput;

    // Sample diffuse color
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    
    // Output color
    output.color = diffuseColor;

    // -1,1 to 0,1
    output.normal = vec4f(in.nor * 0.5 + 0.5, 1.0);

    return output;
}