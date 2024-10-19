// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOutput {
  @location(0) position : vec4f,
  @location(1) albedo : vec4f,
  @location(2) normal : vec4f,
}

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {

  let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
  if (diffuseColor.a < 0.5f) {
    discard;
  }

  var output : GBufferOutput;
  output.position = vec4(in.pos, 1.0);
  output.normal = vec4(normalize(in.nor), 1.0);
  output.albedo = diffuseColor;
  return output;
}