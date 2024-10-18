// WGSL Compute Shader - Extract Brightness
@group(0) @binding(0) var inputTexture: texture_2d<f32>;  // Final canvas texture
@group(0) @binding(1) var brightTexture: texture_storage_2d<r32float, read_write>;  // Brightness texture

@compute @workgroup_size(${bloomKernelSize[0]}, ${bloomKernelSize[1]})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(inputTexture);
    if(global_id.x >= texSize.x || global_id.y >= texSize.y) {
        return;
    }
    let pixel = vec2<f32>(global_id.xy) / vec2<f32>(texSize);
    
    // Read current pixel color
    let color: vec4<f32> = textureLoad(inputTexture, vec2<i32>(global_id.xy), 0);
    
    // Calculate brightness(simple Luminance)
    let brightness: f32 = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    
    // textureStore(brightTexture, vec2<i32>(global_id.xy), vec4<f32>(bitcast<f32>(packRGB32To32Bit(color.rgb))));
    // textureStore(brightTexture, vec2<i32>(global_id.xy), vec4<f32>(bitcast<f32>(packRGB32To32Bit(vec3<f32>(0.1, 0.1, 0.0)))));

    // Brightness threshold
    if (brightness > 0.2) {
        textureStore(brightTexture, vec2<i32>(global_id.xy), vec4<f32>(bitcast<f32>(packRGB32To32Bit(color.rgb))));
    } else {
        textureStore(brightTexture, vec2<i32>(global_id.xy), vec4<f32>(0.0));
    }
}
