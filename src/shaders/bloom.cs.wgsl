struct GaussianKernel2D {
    kernelSize: f32,
    kernel: array<f32>
}

@group(0) @binding(0) var frameTexture: texture_storage_2d<bgra8unorm, read>;
@group(0) @binding(1) var bloomTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<storage, read> kernel2D: GaussianKernel2D;
@group(0) @binding(3) var<uniform> res: Resolution;
@group(0) @binding(4) var textureSampler: sampler;

fn toBloomColor(color: vec3<f32>, _Curve: vec2<f32>) -> vec3<f32> {
    var bright = luminance(color);
    // var _Curve = vec2<f32>(0.8, 0.5);
    var knee = (_Curve.x * _Curve.y);
    var soft = bright - (_Curve.x - knee);
    soft = clamp(soft, 0.0, 1.0);
    soft = soft * soft / (4.0 * knee + 0.1);
    var bloomColor = color * max(soft, bright - _Curve.x) / max(bright, 0.0001);

    return bloomColor;
}


@compute @workgroup_size(${lightCullBlockSize}, ${lightCullBlockSize}, 1)
fn computeMain(@builtin(global_invocation_id) global_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) workgroup_id: vec3u,
    @builtin(num_workgroups) numTiles: vec3u) 
{
    var fragCoord = vec2<f32>(f32(global_id.x), f32(global_id.y));
    if (fragCoord.x >= f32(res.width) || fragCoord.y >= f32(res.height)) {
        return;
    }

    var UV = vec2<f32>(fragCoord.x / f32(res.width), fragCoord.y / f32(res.height));
    var _Curve = vec2<f32>(0.5, 0.1);
    var kernelSize = u32(kernel2D.kernelSize);
    // gaussian blur pass - horizontal
    var bloomColor = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < kernelSize; i = i + 1u) {
        var offset = i - kernelSize / 2;
        var sampleCoord = (fragCoord - vec2(f32(offset), 0.0));
        if (sampleCoord.x < 0.0 || sampleCoord.x > f32(res.width)) {
            sampleCoord = fragCoord;
        }
        var sampleColor = textureLoad(frameTexture, vec2u(sampleCoord)).rgb;
        // var sampleUV = sampleCoord / vec2(f32(res.width), f32(res.height));
        // var sampleColor = textureSample(frameTexture, textureSampler, sampleUV).rgb;
        bloomColor += toBloomColor(sampleColor, _Curve) * kernel2D.kernel[i];
    }

    // var screenColor = textureLoad(frameTexture, vec2u(fragCoord)).rgb;
    // screenColor = toBloomColor(screenColor, _Curve);
    textureStore(bloomTexture, vec2u(fragCoord), vec4<f32>(bloomColor, 1.0));
}