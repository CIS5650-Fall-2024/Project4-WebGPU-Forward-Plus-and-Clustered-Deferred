// This shader should only store G-buffer information and should not do any shading.
struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) gBuffer: vec4<u32>,
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

    let col = pack4x8unorm(diffuseColor);
    let nor = pack2x16unorm(encodeNormalOctahedron(in.nor));
    let z : u32 = pack2x16unorm(vec2<f32>(in.fragPos.z, 1.0));
    out.gBuffer = vec4u(col,nor,z,1);
    
    return out;
}