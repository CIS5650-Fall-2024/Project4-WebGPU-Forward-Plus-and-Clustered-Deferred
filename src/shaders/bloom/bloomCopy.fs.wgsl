// Fragment shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;  // final canvas texture
@group(0) @binding(1) var brightTexture: texture_storage_2d<r32float, read_write>; 
@group(0) @binding(2) var blurTexture: texture_storage_2d<r32float, read_write>;  // blur texture

struct FragmentInput
{
    @location(0) uv: vec2f
}

struct FragmentOutput {
    @location(0) brightness: vec4<f32>,  
    @location(1) blur: vec4<f32>,
};

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    let texCoords = in.uv.xy; 
    let texSize = textureDimensions(brightTexture);
    let pixelPos = vec2<i32>(texCoords * vec2<f32>(texSize));
    let resu32 = textureLoad(brightTexture, pixelPos).r;
    let res = unpack32bitToRGB32(bitcast<u32>(resu32));

    let res232 = textureLoad(blurTexture, pixelPos).r;
    let res2 = unpack32bitToRGB32(bitcast<u32>(res232));

    // let color = textureLoad(inputTexture, pixelPos, 0);
    //return vec4(in.uv, 0.0, 1.0);
    //depth = pow(depth, 40);
    let resBrighness = vec4<f32>(res,1.0);
    let resBlur = vec4<f32>(res2,1.0);
    return FragmentOutput(resBrighness, resBlur);
    // return vec4<f32>(unpack10BitToFloat(float32To10Bit(0.0)),0,0, 1.0);
    // return vec4<f32>(unpack32bitToRGB32(bitcast<u32>(bitcast<f32>(packRGB32To32Bit(vec3<f32>(0.2, 0.44, 0.0))))), 1.0);
}