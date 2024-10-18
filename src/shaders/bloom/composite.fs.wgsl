// Fragment shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;  // final canvas texture
@group(0) @binding(1) var brightTexture: texture_storage_2d<r32float, read_write>; 
@group(0) @binding(2) var blurTexture: texture_storage_2d<r32float, read_write>;  // blur texture

struct FragmentInput
{
    @location(0) uv: vec2f
}


@fragment
fn main(in: FragmentInput) -> @location(0) vec4<f32>  {
    let texCoords = in.uv.xy; 
    let texSize = textureDimensions(brightTexture);
    let pixelPos = vec2<i32>(texCoords * vec2<f32>(texSize));

    let originalColor: vec3<f32> = textureLoad(inputTexture, pixelPos, 0).rgb;
    let blurredColor: vec3<f32> = unpack32bitToRGB32(bitcast<u32>(textureLoad(blurTexture, pixelPos).r));


    let finalColor = originalColor + 0.2 * blurredColor;
    return vec4<f32>(finalColor.rgb, 1.0);
}