// WGSL Compute shader (Box Blur)
@group(0) @binding(1) var brightTexture: texture_storage_2d<r32float, read_write>;  // brightness texture
@group(0) @binding(2) var blurTexture: texture_storage_2d<r32float, read_write>;  // blur texture
@group(0) @binding(4) var<uniform> blurDirection: u32; 

// blur radius
// const blurRadius: i32 = 5;

//const weight : array<f32, 5> = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
const weight : array<f32, 5> = array<f32, 5>(0.2, 0.1, 0.1, 0.1, 0.1);

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize: vec2<u32> = textureDimensions(brightTexture);
    if(global_id.x >= texSize.x || global_id.y >= texSize.y) {
        return;
    }

    let pixelPos = vec2<i32>(global_id.xy);
    var colorSum: vec3<f32> = vec3<f32>(0.0);
    var totalWeight: f32 = 0;
    var colorPacked: f32;

    colorSum = unpack32bitToRGB32(bitcast<u32>(textureLoad(brightTexture, pixelPos).r)) * weight[0];
    totalWeight += weight[0];
    //count++;

    let isHorizontalBlur = blurDirection == 1u; 
    var samplePos: vec2<i32>;
    // traverse the pixels in the blur radius
    for (var i: i32 = 1; i < 5; i++) {
        if(isHorizontalBlur)
        {
            samplePos = vec2<i32>(pixelPos + vec2<i32>(i, 0));
        }
        else
        {
            samplePos = vec2<i32>(pixelPos + vec2<i32>(0, i));
        }
        // check if the sample position is within the texture bounds
        if (samplePos.x >= 0 && samplePos.x < i32(texSize.x) && samplePos.y >= 0 && samplePos.y < i32(texSize.y)) {
            colorPacked = textureLoad(brightTexture, samplePos).r;
            colorSum += unpack32bitToRGB32(bitcast<u32>(colorPacked)) * weight[i];
            totalWeight += weight[i];
            //count++;
        }

        if(isHorizontalBlur)
        {
            samplePos = vec2<i32>(pixelPos - vec2<i32>(i, 0));
        }
        else
        {
            samplePos = vec2<i32>(pixelPos - vec2<i32>(0, i));
        }
        // check if the sample position is within the texture bounds
        if (samplePos.x >= 0 && samplePos.x < i32(texSize.x) && samplePos.y >= 0 && samplePos.y < i32(texSize.y)) {
            colorPacked = textureLoad(brightTexture, samplePos).r;
            colorSum += unpack32bitToRGB32(bitcast<u32>(colorPacked)) * weight[i];
            totalWeight += weight[i];
            //count++;
        }
    }
    let finalColor: vec3<f32> = colorSum / totalWeight;
    
    // Average
    let blurredColor = vec4<f32>(bitcast<f32>(packRGB32To32Bit(finalColor)),0,0, 1.0);
    //let blurredColor = vec4<f32>(colorSum / f32(count), 1.0);
    textureStore(blurTexture, pixelPos, blurredColor);
}
