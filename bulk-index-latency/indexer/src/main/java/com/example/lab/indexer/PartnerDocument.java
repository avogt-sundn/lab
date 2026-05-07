package com.example.lab.indexer;

import io.quarkus.runtime.annotations.RegisterForReflection;

@RegisterForReflection
public class PartnerDocument {
    public long partnerNumber;
    public String alphaCode;
    public String name1;
    public String name2;
    public String name3;
    public String firstname;
    public String street;
    public String houseNumber;
    public String postalCode;
    public String city;
    public String type;
    public String groupType;
    public Long groupNumber;
}
