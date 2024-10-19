@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @location(3) depth: f32
}

struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normalAndDepth : vec4f,
}

@fragment
fn main(
    in: FragmentInput
) -> GBufferOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var output: GBufferOutput;
    output.albedo = vec4f(diffuseColor.rgb, 1.0);
    output.normalAndDepth = vec4f(in.nor.x, in.nor.y, in.depth, 0.0);

    return output;
}