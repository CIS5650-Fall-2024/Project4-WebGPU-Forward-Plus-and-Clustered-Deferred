// TODO-3: implement the Clustered Deferred fullscreen vertex shader
// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f
{
    const pos = array(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );
    return vec4f(pos[i], 0.0, 1.0);
}