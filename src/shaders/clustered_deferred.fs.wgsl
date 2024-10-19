// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) pos: vec4<f32>,
    @location(1) col: vec4<f32>,
    @location(2) nor: vec4<f32>,

};

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;
@fragment
fn main(in: VertexOutput) -> GBufferOutput {
    var out: GBufferOutput;
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    out.col = diffuseColor;
    out.nor = vec4<f32>(in.nor, 1.0);
    out.pos = in.fragPos;
    return out;
}