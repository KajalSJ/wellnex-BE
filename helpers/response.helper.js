const send200 = (res, data) => {
    res.status(200).json({ code: 200, ...data });
  },
  send201 = (res, data) => {
    res.status(201).json({ code: 201, ...data });
  },
  send400 = (res, data) => {
    res.status(400).json({ code: 400, ...data });
  },
  send401 = (res, data) => {
    res.status(401).json({ code: 401, ...data });
  },
  send403 = (res, data) => {
    res.status(403).json({ code: 403, ...data });
  },
  send404 = (res, data) => {
    res.status(404).json({ code: 404, ...data });
  },
  send500 = (res, data) => {
    res.status(500).json({ code: 500, ...data });
  },
  responseHelper = {
    send200,
    send201,
    send400,
    send401,
    send403,
    send404,
    send500,
  };

export default responseHelper;
