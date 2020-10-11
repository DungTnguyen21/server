const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");
const redis = require("redis");
const app = express();
const client = redis.createClient();
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { verify, sign, decode } = jwt;
app.use(cors());
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const getBandwith = (date_begin, date_end, biz_id, user_id) => {
  let res = axios({
    method: "POST",
    url: "https://filestore-billing-api-dev.vngcloud.vn/api/bandwidth",
    data: {
      biz_id,
      date_begin,
      date_end,
      user_id,
    },
    headers: {
      "Content-Type": "application/json",
      token: `${sign(
        { app_name: "frontend", time: new Date().getTime() },
        process.env.API_SECRET_KEY
      )}`,
    },
  });
  return res;
};
const getStorageOverall = async (biz_id, user_id) => {
  return await axios({
    method: "POST",
    url: "https://filestore-billing-api-dev.vngcloud.vn/api/quotaoverall",
    data: {
      biz_id,
      user_id,
    },
    headers: {
      "Content-Type": "application/json",
      token: `${sign(
        { app_name: "frontend", time: new Date().getTime() },
        process.env.API_SECRET_KEY
      )}`,
    },
  });
};
const getStorageDetail = async (biz_id, user_id) => {
  return await axios({
    method: "POST",
    url: "https://filestore-billing-api-dev.vngcloud.vn/api/quotadetail",
    data: {
      biz_id,
      user_id,
    },
    headers: {
      "Content-Type": "application/json",
      token: `${sign(
        { app_name: "frontend", time: new Date().getTime() },
        process.env.API_SECRET_KEY
      )}`,
    },
  });
};
app.post("/api/signIn", async (req, res) => {
  if (req.method === "POST") {
    let { username, password } = req.body;
    let response = await axios({
      method: "POST",
      url: "https://45.127.253.204/vFSGW/public/v1/Authen",
      data: {
        username,
        password,
      },
    });
    if (response.status === 200) {
      let { data } = response;
      let token = jwt.sign(
        {
          username: data.username,
          biz_id: data.bizid,
          user_id: data.id,
        },
        "super_secret_key"
      );
      res.json({
        token,
        data,
      });

      res.end();
    } else {
      res.statusCode = 404;
      res.end();
    }
  } else res.statusCode = 404;
});
app.listen(2112, () => {
  console.log("Server listening on port :", 2112);
});

const Record = (data, biz_id) => {
  return {
    biz_id: biz_id,
    bandwidth: data.bandwidth,
    request_status: data.request_status,
    date_begin: data.date_begin,
    date_end: data.date_end,
  };
};

const median = (arr) => {
  let mid = Math.ceil(arr.length / 2);
  if (arr.length == 0) return 0;
  return arr.length % 2 === 0 ? (arr[mid] + arr[mid - 1]) / 2 : arr[mid];
};
const calcSum = (arr) => {
  if (arr.length == 0) return 0;
  return arr.reduce((accumulator, curr) => accumulator + curr, 0);
};
const DayFilter = (date_begin, date_end, data) => {
  let arr = [];

  for (let i = date_begin; i < date_end; i += 86400000) {
    let daydataarr = [];
    let dayarr = data.filter((val) => {
      return parseInt(val.time) < i + 86400000 && parseInt(val.time) > i;
    });

    for (let j = i; j < i + 86400000; j += 3600000) {
      let hourarr = dayarr.filter(
        (val) => j <= parseInt(val.time) && parseInt(val.time) < j + 3600000
      );
      //console.log(hourarr)

      let num_1xx = hourarr
        .map((item) => (item ? parseInt(item.num_1xx) : 0))
        .sort((a, b) => a - b);
      let num_2xx = hourarr
        .map((item) => (item ? parseInt(item.num_2xx) : 0))
        .sort((a, b) => a - b);
      let num_3xx = hourarr
        .map((item) => (item ? parseInt(item.num_3xx) : 0))
        .sort((a, b) => a - b);
      let num_4xx = hourarr
        .map((item) => (item ? parseInt(item.num_4xx) : 0))
        .sort((a, b) => a - b);
      let num_5xx = hourarr
        .map((item) => (item ? parseInt(item.num_5xx) : 0))
        .sort((a, b) => a - b);
      //console.log(hourarr)
      daydataarr.push({
        time: `${j + 1800000}`,
        num_1xx: [median(num_1xx), calcSum(num_1xx)],
        num_2xx: [median(num_2xx), calcSum(num_2xx)],
        num_3xx: [median(num_3xx), calcSum(num_3xx)],
        num_4xx: [median(num_4xx), calcSum(num_4xx)],
        num_5xx: [median(num_4xx), calcSum(num_4xx)],
        //total :calcSum(num_1xx)+calcSum(num_2xx)+calcSum(num_3xx)+calcSum(num_4xx)+calcSum(num_5xx)
      });
    }
    if (
      daydataarr
        .map(
          (item) =>
            item.num_1xx[1] +
            item.num_2xx[1] +
            item.num_3xx[1] +
            item.num_4xx[1] +
            item.num_5xx[1]
        )
        .reduce((a, v) => a + v) > 0
    ) {
      arr.push({
        date: `${i}`,
        daydataarr,
      });
    }
  }
  return arr;
};
// console.log(process.env)
app.post("/api/getBandwidth", async (req, res) => {
  if (req.method !== "POST") res.statusCode = 404;
  else {
    const { authorization } = req.headers;
    if (authorization) {
      if (verify(authorization.split(" ")[1], process.env.SECRET_KEY)) {
        const { date_begin, date_end, type } = req.body;
        // console.log({date_begin,date_end})
        // console.log(decode(authorization.split(" ")[1]))
        let { biz_id } = decode(authorization.split(" ")[1]);

        await client.get(biz_id, async (err, record) => {
          // console.log("this")
          if (record) {
            let recordObject = await JSON.parse(record);
            let bandwidth = [];
            let request = [];
            //console.log(recordObject)
            if (
              recordObject.date_begin > date_begin ||
              recordObject.date_end < date_end
            ) {
              if (recordObject.date_begin > date_begin) {
                console.log("first");
                try{

                    let { data ,status} = await getBandwith(
                        date_begin,
                        recordObject.date_begin,
                        biz_id
                        );
                     console.log(`data : ${status}`)
                        let data_begin = await data;
                        bandwidth = bandwidth.concat(data_begin.bandwidth);
                        request = request.concat(data_begin.request_status);
                    }catch(e){
                        console.log(e)
                        res.status(400).end()
                    }
                    }
                    bandwidth=bandwidth.concat(recordObject.bandwidth);
              request=request.concat(recordObject.request_status);
              if (recordObject.date_end < date_end) {
                console.log("append");
                try {
                  let { data } = await getBandwith(
                    recordObject.date_end,
                    date_end,
                    biz_id
                  );
                  let data_end = await data;
                  bandwidth=bandwidth.concat(await data_end.bandwidth);
                  request=request.concat(await data_end.request_status);
                } catch (e) {}
              }
              await client.setex(
                biz_id,
                3600,
                JSON.stringify(
                  Record(
                    {
                      bandwidth,
                      request_status: request,
                      date_begin: date_begin,
                      date_end: date_end,
                    },
                    biz_id
                  )
                )
              );
              // console.log(bandwidth)
              res.json({
                data:
                  type === "bandwidth"
                    ? bandwidth.filter(
                        (item) =>
                          parseInt(item.date) >= date_begin &&
                          parseInt(item.date) <= date_end
                      )
                    : DayFilter(date_begin, date_end, request),
              });
            } else {
              console.log("then this");
              //console.log(DayFilter(recordObject.request_status,date_begin,date_end))
              await res.json({
                data:
                  type === "bandwidth"
                    ? recordObject.bandwidth.filter(
                        (item) =>
                          parseInt(item.date) >= date_begin &&
                          parseInt(item.date) <= date_end
                      )
                    : DayFilter(
                        date_begin,
                        date_end,
                        recordObject.request_status
                      ),
              });
            }
          } else {
              try {
                console.log("get raw");
              let { data } = await getBandwith(date_begin, date_end, biz_id);
              client.setex(
                biz_id,
                3600,
                JSON.stringify(
                  Record(
                    {
                      bandwidth: await data.bandwidth,
                      request_status:await data.request_status,
                      date_begin,
                      date_end,
                    },
                    biz_id
                  )
                )
              );
              res.json({
                data:
                  type === "bandwidth"
                    ? data.bandwidth.filter(
                        (item) =>
                          parseInt(item.date) >= date_begin &&
                          parseInt(item.date) <= date_end
                      )
                    : DayFilter(
                        date_begin,
                        date_end,
                        await data.request_status
                      ),
              });
            } catch (e) {
              console.log(e);
              res.status(400).end();
            }
          }
        });
      } else res.status(400).end();
    } else res.status(400).end();
  }
});
dotenv.config();
app.post("/api/getStorageDetail", async (req, res) => {
  // console.log(req.headers);
  if (req.method === "POST") {
    const { authorization } = req.headers;
    if (verify(authorization.split(" ")[1], dotenv.SECRET_KEY)) {
      //console.log(decode(authorization));
      let { biz_id, user_id } = decode(authorization.split(" ")[1]);
      let response = getStorageDetail(biz_id, user_id);
      if ((await response).status === 404) {
        res.statusCode = 404;
        res.end();
      } else {
        res.json((await response).data);
        res.end();
      }
    }
  }
});
app.post("/api/getStorageOverall", async (req, res) => {
  console.log(req.headers);
  if (req.method === "POST") {
    const { authorization } = req.headers;
    if (verify(authorization.split(" ")[1], process.env.SECRET_KEY)) {
      // console.log(decode(authorization));
      let { biz_id, user_id } = decode(authorization.split(" ")[1]);
      let response = getStorageOverall(biz_id);
      // console.log((await response).data)
      if ((await response).status === 404) {
        res.statusCode = 404;
        res.end();
      } else {
        res.json((await response).data);
        res.end();
      }
    }
  }
});
