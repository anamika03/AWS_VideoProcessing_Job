const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const batch = new AWS.Batch();

exports.processVideo = async (event, context) => {
  try {
    const { Records } = event;
    const record = Records[0]; // Assuming only one file is dropped at a time
    const { bucket: { name: bucketName }, object: { key: objectKey } } = record.s3;

    const jobId = await submitBatchJob(bucketName, objectKey);
    await monitorBatchJob(jobId);

    return {
      statusCode: 200,
      body: 'Video processing completed',
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

async function submitBatchJob(bucketName, objectKey) {
  const jobName = 'video-processing-job';
  const command = `ffmpeg -i s3://${bucketName}/${objectKey} -vf fps=1/30 /tmp/frame-%03d.jpg`;
  const outputLocation = `s3://${process.env.OUTPUT_BUCKET}`;

  const params = {
    jobName,
    jobQueue: 'video-processing-queue',
    jobDefinition: 'video-processing-definition',
    containerOverrides: {
      environment: [
        {
          name: 'INPUT_BUCKET',
          value: bucketName,
        },
        {
          name: 'OUTPUT_BUCKET',
          value: process.env.OUTPUT_BUCKET,
        },
      ],
    },
    parameters: {
      inputKey: objectKey,
      outputLocation,
      command,
    },
  };

  const response = await batch.submitJob(params).promise();
  return response.jobId;
}

async function monitorBatchJob(jobId) {
  const params = {
    jobId,
  };

  let jobStatus = 'SUBMITTED';
  while (jobStatus !== 'SUCCEEDED' && jobStatus !== 'FAILED') {
    const response = await batch.describeJobs(params).promise();
    const job = response.jobs[0];
    jobStatus = job.status;

    if (jobStatus === 'SUCCEEDED') {
      console.log('Batch job succeeded');
    } else if (jobStatus === 'FAILED') {
      console.log('Batch job failed');
      throw new Error('Batch job failed');
    } else {
      console.log('Batch job is still running...');
      await sleep(5000); // Wait for 5 seconds before checking job status again
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}