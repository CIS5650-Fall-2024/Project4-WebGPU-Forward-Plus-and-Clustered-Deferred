// WGSL Compute Shader - Synthesize Bloom
@group(0) @binding(0) var inputTexture: texture_2d<f32>;  // final canvas texture
@group(0) @binding(2) var blurTexture: texture_storage_2d<r32float, read_write>;   // blur texture
@group(0) @binding(3) var outputTexture: texture_storage_2d<r32float, read_write>;  // output texture

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(inputTexture);
    if(global_id.x >= texSize.x || global_id.y >= texSize.y) {
        return;
    }

    let pixelPos = vec2<i32>(global_id.xy);
    
    let originalColor: vec4<f32> = textureLoad(inputTexture, pixelPos, 0);
    let blurredColor: vec4<f32> = textureLoad(blurTexture, pixelPos);
    
    let finalColor = originalColor + blurredColor;
    textureStore(outputTexture, pixelPos, finalColor);
}
