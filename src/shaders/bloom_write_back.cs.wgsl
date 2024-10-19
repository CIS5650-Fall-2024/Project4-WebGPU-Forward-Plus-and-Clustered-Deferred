struct GaussianKernel2D {
    kernelSize: f32,
    kernel: array<f32>
}

@group(0) @binding(0) var frameTexture: texture_storage_2d<bgra8unorm, write>;
@group(0) @binding(1) var bloomTexture: texture_storage_2d<rgba16float, read>;
@group(0) @binding(2) var<storage, read> kernel2D: GaussianKernel2D;
@group(0) @binding(3) var<uniform> res: Resolution;
@group(0) @binding(4) var textureSampler: sampler;

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
    var kernelSize = u32(kernel2D.kernelSize);
    // gaussian blur pass - vertical
    var bloomColor = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < kernelSize; i = i + 1u) {
        var offset = i - kernelSize / 2;
        var sampleCoord = (fragCoord - vec2(f32(offset), 0.0));
        if (sampleCoord.x < 0.0 || sampleCoord.x > f32(res.width)) {
            sampleCoord = fragCoord;
        }
        var sampleColor = textureLoad(bloomTexture, vec2u(sampleCoord)).rgb;
        // var sampleUV = sampleCoord / vec2(f32(res.width), f32(res.height));
        // var sampleColor = textureSample(bloomTexture, textureSampler, sampleUV).rgb;
        bloomColor += sampleColor * kernel2D.kernel[i + kernelSize];
    }


    // textureStore(frameTexture, vec2u(fragCoord), vec4<f32>(bloomColor, 1.0));
}