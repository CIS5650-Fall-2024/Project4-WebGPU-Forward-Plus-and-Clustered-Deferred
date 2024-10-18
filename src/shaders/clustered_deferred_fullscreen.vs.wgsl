struct VertexInput
{
    @location(0) pos: vec2f
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    var out: VertexOutput;
    out.fragPos = vec4f(in.pos, 0, 1);
    out.pos = in.pos;
    return out;
}
