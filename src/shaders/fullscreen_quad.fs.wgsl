@group(0) @binding(0) var postprocessedTexture: texture_2d<f32>;
@group(0) @binding(1) var postprocessedSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / vec2<f32>(textureDimensions(postprocessedTexture, 0));
    return textureSample(postprocessedTexture, postprocessedSampler, uv);
}