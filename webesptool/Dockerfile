FROM  python:3.11-slim

ARG dir=/home/webesptool

RUN python3 --version;
RUN apt-get update -y;
RUN apt-get upgrade -y;


RUN apt-get -y install git python3-pip wget

RUN python3 --version;
RUN pip3 install --upgrade pip

COPY requirements.txt .
RUN pip3 install -r requirements.txt

#ENV TZ="Europe/Moscow"
# Python service

RUN mkdir -p ${dir} ${dir}/log ${dir}/data ${dir}/bin
COPY *.py ${dir}
ADD utils ${dir}/utils
ADD config ${dir}/config
ADD apps ${dir}/apps
ADD templates ${dir}/templates
ADD bin ${dir}/bin
ADD static ${dir}/static

WORKDIR ${dir}
CMD ["python3","service.py"]
