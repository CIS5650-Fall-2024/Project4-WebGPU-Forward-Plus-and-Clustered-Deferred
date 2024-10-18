@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOutput {
    @location(0) out : vec4u
}

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4u {
  
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let packedAlbedo = pack4x8unorm(diffuseColor);
    let packedNormal = pack2x16unorm(encodeNormal(in.nor));
    let castedDepth : u32 = bitcast<u32>(in.fragPos.z);

    return vec4u(packedAlbedo, packedNormal, castedDepth, 0);
}