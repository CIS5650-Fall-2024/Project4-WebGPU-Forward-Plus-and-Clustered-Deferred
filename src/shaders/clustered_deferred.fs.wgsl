// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

// Outputs for G-buffer (multiple render targets)
struct GBufferOutput {
    @location(0) position: vec4<f32>,      // World space position (encoded in RGB)
    @location(1) normal: vec4<f32>,        // World space normal (encoded in RGB)
    @location(2) albedo: vec4<f32>        // Albedo/diffuse color (encoded in RGB)
};

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var out : GBufferOutput;
    out.position = vec4<f32>(in.pos.xyz, 1.0);
    out.normal = vec4<f32>(normalize(in.nor.xyz), 1.0);
    out.albedo = vec4<f32>(diffuseColor.rgb, 1.0);

    return out;
}
