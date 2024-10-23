// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexInput
{
    @location(0) pos: vec3<f32>
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4<f32>,
    @location(0) texCoord: vec2<f32>
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    var out: VertexOutput;
    out.fragPos = vec4<f32>(in.pos, 1.0);
    out.texCoord = in.pos.xy * 0.5 + 0.5;
    return out;
}