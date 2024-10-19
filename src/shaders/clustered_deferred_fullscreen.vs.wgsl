// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
@vertex
fn main(@builtin(vertex_index) VertexIndex: u32) -> @builtin(position) vec4<f32> {
    // Define positions for a fullscreen triangle that covers the entire screen
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    // Get the position for the current vertex
    let position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);

    // Return the position to the rasterizer
    return position;
}
