// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
// forward_plus.vs.wgsl

struct VertexInput
{
    @location(0) pos: vec2f,
}

@vertex
fn main(in: VertexInput) -> @builtin(position) vec4<f32>
{
    return vec4(in.pos, 0.0, 1.0);
}
